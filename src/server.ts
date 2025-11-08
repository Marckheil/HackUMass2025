import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const app = express();
const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/m4a'];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// Error handling middleware
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================
// HEALTH & STATUS ENDPOINTS
// ============================================

app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'SOAPify API',
    version: '1.0.0'
  });
});

app.get('/api/status', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check OpenAI
    const openaiStatus = !!process.env.OPENAI_API_KEY;
    
    // Check Supabase
    const supabaseStatus = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
    
    res.json({
      status: 'healthy',
      services: {
        database: 'connected',
        openai: openaiStatus ? 'configured' : 'not configured',
        supabase: supabaseStatus ? 'configured' : 'not configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Service check failed',
      timestamp: new Date().toISOString()
    });
  }
}));

// ============================================
// USER MANAGEMENT ENDPOINTS
// ============================================

// Create or get user
app.post('/api/users', asyncHandler(async (req: Request, res: Response) => {
  const { email, name } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  let user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    user = await prisma.user.create({
      data: { 
        email, 
        name: name || null 
      }
    });
    console.log(`Created new user: ${email}`);
  } else {
    console.log(`Returning existing user: ${email}`);
  }
  
  res.json(user);
}));

// Get user by ID
app.get('/api/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const user = await prisma.user.findUnique({ 
    where: { id },
    include: {
      _count: {
        select: { notes: true }
      }
    }
  });
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(user);
}));

// Get user by email
app.get('/api/users/email/:email', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.params;
  
  const user = await prisma.user.findUnique({ 
    where: { email },
    include: {
      _count: {
        select: { notes: true }
      }
    }
  });
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(user);
}));

// Update user
app.put('/api/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email } = req.body;
  
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email })
    }
  });
  
  res.json(user);
}));

// ============================================
// AUDIO PROCESSING & SOAP GENERATION
// ============================================

// Upload and process audio
app.post('/api/notes/upload', upload.single('audio'), asyncHandler(async (req: Request, res: Response) => {
  const { userId, title } = req.body;
  const audioFile = req.file;
  
  console.log('=== AUDIO UPLOAD REQUEST ===');
  console.log('User ID:', userId);
  console.log('File:', audioFile?.originalname);
  
  if (!audioFile) {
    return res.status(400).json({ error: 'No audio file provided' });
  }
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1. Transcribe audio with Whisper
    console.log('Step 1: Transcribing audio with Whisper...');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.path),
      model: 'whisper-1',
      language: 'en'
    });

    const transcribedText = transcription.text;
    console.log('Transcription complete:', transcribedText.substring(0, 150) + '...');

    // 2. Upload audio to Supabase Storage
    console.log('Step 2: Uploading audio to Supabase Storage...');
    const audioBuffer = fs.readFileSync(audioFile.path);
    const fileName = `${userId}/${Date.now()}_${audioFile.originalname}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(fileName, audioBuffer, {
        contentType: audioFile.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('audio-files')
      .getPublicUrl(fileName);

    console.log('Audio uploaded to:', publicUrl);

    // 3. Generate SOAP note using GPT-4o-mini
    console.log('Step 3: Generating SOAP note with GPT-4o-mini...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert medical documentation assistant. Convert the following clinical note into a structured SOAP format.

SOAP format explained:
- **Subjective (S)**: Patient's symptoms, complaints, history, and concerns in their own words. Include chief complaint, history of present illness, and relevant patient statements.
- **Objective (O)**: Observable, measurable findings. Include vital signs, physical examination findings, lab results, imaging results, and other objective data.
- **Assessment (A)**: Clinical interpretation, diagnosis, and clinical reasoning. Include differential diagnoses, working diagnosis, and clinical impression.
- **Plan (P)**: Treatment plan, medications, procedures, follow-up, patient education, and next steps.

Rules:
1. Respond ONLY with valid JSON in this exact format - no markdown, no explanation
2. Extract information accurately from the transcription
3. If a section has no relevant information, use an empty string ""
4. Generate a concise, descriptive title (max 60 characters)
5. Use proper medical terminology where appropriate
6. Be thorough but concise

JSON format:
{
  "title": "Brief descriptive title",
  "subjective": "Subjective findings",
  "objective": "Objective findings", 
  "assessment": "Clinical assessment",
  "plan": "Treatment plan"
}`
        },
        {
          role: 'user',
          content: `Transcribed clinical note:\n\n${transcribedText}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const soapContent = completion.choices[0].message.content;
    console.log('SOAP generation complete');
    
    let soapData;
    
    try {
      // Clean and parse the response
      const cleanedContent = soapContent
        ?.replace(/```json\n?|\n?```/g, '')
        .replace(/```\n?|\n?```/g, '')
        .trim();
      soapData = JSON.parse(cleanedContent || '{}');
      
      // Validate required fields
      if (!soapData.title) soapData.title = title || 'Clinical Note';
      if (!soapData.subjective) soapData.subjective = '';
      if (!soapData.objective) soapData.objective = '';
      if (!soapData.assessment) soapData.assessment = '';
      if (!soapData.plan) soapData.plan = '';
      
    } catch (parseError) {
      console.error('Failed to parse SOAP JSON:', parseError);
      console.error('Raw response:', soapContent);
      
      // Fallback: create basic structure
      soapData = {
        title: title || 'Clinical Note',
        subjective: transcribedText,
        objective: '',
        assessment: '',
        plan: ''
      };
    }

    // 4. Save note to database
    console.log('Step 4: Saving note to database...');
    const note = await prisma.note.create({
      data: {
        title: soapData.title,
        subjective: soapData.subjective,
        objective: soapData.objective,
        assessment: soapData.assessment,
        plan: soapData.plan,
        rawInput: transcribedText,
        audioUrl: publicUrl,
        userId: userId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    // Clean up local file
    fs.unlinkSync(audioFile.path);
    console.log('Local file cleaned up');
    
    console.log('=== UPLOAD COMPLETE ===');
    console.log('Note ID:', note.id);

    res.json({
      success: true,
      note: note,
      processing: {
        transcription_length: transcribedText.length,
        audio_url: publicUrl
      }
    });
    
  } catch (error: any) {
    console.error('Error processing audio:', error);
    
    // Clean up file if it exists
    if (audioFile && fs.existsSync(audioFile.path)) {
      fs.unlinkSync(audioFile.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to process audio',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// Process text directly (no audio)
app.post('/api/notes/text', asyncHandler(async (req: Request, res: Response) => {
  const { userId, text, title } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  if (!text) {
    return res.status(400).json({ error: 'Text content is required' });
  }
  
  console.log('=== TEXT PROCESSING REQUEST ===');
  console.log('User ID:', userId);
  console.log('Text length:', text.length);
  
  try {
    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate SOAP note using GPT-4o-mini
    console.log('Generating SOAP note...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert medical documentation assistant. Convert the following clinical note into a structured SOAP format.

SOAP format explained:
- **Subjective (S)**: Patient's symptoms, complaints, history, and concerns in their own words.
- **Objective (O)**: Observable, measurable findings including vitals, exam findings, and lab results.
- **Assessment (A)**: Clinical interpretation, diagnosis, and clinical reasoning.
- **Plan (P)**: Treatment plan, medications, procedures, follow-up, and next steps.

Respond ONLY with valid JSON in this exact format:
{
  "title": "Brief descriptive title",
  "subjective": "Subjective findings",
  "objective": "Objective findings",
  "assessment": "Clinical assessment",
  "plan": "Treatment plan"
}`
        },
        {
          role: 'user',
          content: `Clinical note:\n\n${text}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const soapContent = completion.choices[0].message.content;
    
    let soapData;
    try {
      const cleanedContent = soapContent
        ?.replace(/```json\n?|\n?```/g, '')
        .replace(/```\n?|\n?```/g, '')
        .trim();
      soapData = JSON.parse(cleanedContent || '{}');
      
      if (!soapData.title) soapData.title = title || 'Clinical Note';
      if (!soapData.subjective) soapData.subjective = '';
      if (!soapData.objective) soapData.objective = '';
      if (!soapData.assessment) soapData.assessment = '';
      if (!soapData.plan) soapData.plan = '';
      
    } catch (parseError) {
      console.error('Failed to parse SOAP JSON:', parseError);
      soapData = {
        title: title || 'Clinical Note',
        subjective: text,
        objective: '',
        assessment: '',
        plan: ''
      };
    }

    // Save note to database
    const note = await prisma.note.create({
      data: {
        title: soapData.title,
        subjective: soapData.subjective,
        objective: soapData.objective,
        assessment: soapData.assessment,
        plan: soapData.plan,
        rawInput: text,
        audioUrl: null,
        userId: userId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    console.log('=== TEXT PROCESSING COMPLETE ===');
    res.json({
      success: true,
      note: note
    });
    
  } catch (error: any) {
    console.error('Error processing text:', error);
    res.status(500).json({ 
      error: 'Failed to process text',
      message: error.message
    });
  }
}));

// ============================================
// NOTE MANAGEMENT ENDPOINTS
// ============================================

// Get all notes for a user
app.get('/api/notes/user/:userId', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { limit, offset, search } = req.query;
  
  const queryLimit = limit ? parseInt(limit as string) : 50;
  const queryOffset = offset ? parseInt(offset as string) : 0;
  
  const where: any = { userId };
  
  if (search) {
    where.OR = [
      { title: { contains: search as string, mode: 'insensitive' } },
      { subjective: { contains: search as string, mode: 'insensitive' } },
      { objective: { contains: search as string, mode: 'insensitive' } },
      { assessment: { contains: search as string, mode: 'insensitive' } },
      { plan: { contains: search as string, mode: 'insensitive' } }
    ];
  }
  
  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: queryLimit,
      skip: queryOffset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    }),
    prisma.note.count({ where })
  ]);
  
  res.json({
    notes,
    pagination: {
      total,
      limit: queryLimit,
      offset: queryOffset,
      hasMore: (queryOffset + queryLimit) < total
    }
  });
}));

// Get a single note
app.get('/api/notes/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });
  
  if (!note) {
    return res.status(404).json({ error: 'Note not found' });
  }
  
  res.json(note);
}));

// Update a note
app.put('/api/notes/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, subjective, objective, assessment, plan } = req.body;
  
  const updateData: any = {};
  if (title !== undefined) updateData.title = title;
  if (subjective !== undefined) updateData.subjective = subjective;
  if (objective !== undefined) updateData.objective = objective;
  if (assessment !== undefined) updateData.assessment = assessment;
  if (plan !== undefined) updateData.plan = plan;
  
  const note = await prisma.note.update({
    where: { id },
    data: updateData,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });
  
  res.json(note);
}));

// Delete a note
app.delete('/api/notes/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const note = await prisma.note.findUnique({ where: { id } });
  
  if (!note) {
    return res.status(404).json({ error: 'Note not found' });
  }
  
  // Delete audio from Supabase if exists
  if (note.audioUrl) {
    try {
      const urlParts = note.audioUrl.split('/audio-files/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from('audio-files').remove([filePath]);
        console.log('Deleted audio file:', filePath);
      }
    } catch (error) {
      console.error('Failed to delete audio file:', error);
    }
  }
  
  await prisma.note.delete({ where: { id } });
  
  res.json({ 
    success: true,
    message: 'Note deleted successfully',
    id 
  });
}));

// Bulk delete notes
app.post('/api/notes/bulk-delete', asyncHandler(async (req: Request, res: Response) => {
  const { noteIds, userId } = req.body;
  
  if (!Array.isArray(noteIds) || noteIds.length === 0) {
    return res.status(400).json({ error: 'Note IDs array is required' });
  }
  
  const result = await prisma.note.deleteMany({
    where: {
      id: { in: noteIds },
      ...(userId && { userId })
    }
  });
  
  res.json({
    success: true,
    deleted: result.count
  });
}));

// ============================================
// STATISTICS & ANALYTICS
// ============================================

app.get('/api/users/:userId/stats', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  const [totalNotes, recentNotes, oldestNote, newestNote] = await Promise.all([
    prisma.note.count({ where: { userId } }),
    prisma.note.count({ 
      where: { 
        userId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      } 
    }),
    prisma.note.findFirst({ 
      where: { userId },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.note.findFirst({ 
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })
  ]);
  
  res.json({
    totalNotes,
    recentNotes,
    oldestNote: oldestNote?.createdAt,
    newestNote: newestNote?.createdAt
  });
}));

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'File upload error',
      message: err.message
    });
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('=================================');
  console.log(`🚀 SOAPify API Server Running`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=================================');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});