# SOAPify Backend - AI-Powered Clinical Note Assistant

Complete backend API for SOAPify that handles audio recording, transcription, SOAP note generation, and storage.

## 🏗️ Architecture

- **Backend**: Node.js + Express + TypeScript
- **Database**: Supabase (PostgreSQL)
- **ORM**: Prisma
- **AI**: OpenAI Whisper (transcription) + GPT-4o-mini (SOAP generation)
- **Storage**: Supabase Storage (audio files)

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (via Supabase)
- OpenAI API key
- Supabase account

## 🚀 Quick Start

### 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to be provisioned (2-3 minutes)
3. Go to **Settings** → **API** and copy:
   - Project URL (looks like: `https://xxxxx.supabase.co`)
   - Anon/public key (long string starting with `eyJ`)
4. Go to **Settings** → **Database** and copy the connection string
   - Choose "URI" format
   - It looks like: `postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres`
5. Go to **Storage** → Create a new bucket:
   - Name: `audio-files`
   - **Make it PUBLIC** (so audio files can be accessed)

### 2. Get OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to API Keys section
4. Create a new API key
5. Copy it (starts with `sk-`)

### 3. Backend Installation

```bash
# Create project directory
mkdir soapify-backend
cd soapify-backend

# Initialize npm
npm init -y

# Install dependencies
npm install @prisma/client @supabase/supabase-js cors express multer openai

# Install dev dependencies
npm install -D @types/cors @types/express @types/multer @types/node prisma tsx typescript

# Create directory structure
mkdir -p src uploads prisma
```

### 4. Create Configuration Files

**Create `prisma/schema.prisma`** (use the artifact provided)

**Create `src/server.ts`** (use the artifact provided)

**Create `.env`** file in root directory:

```env
# Database - Replace with your Supabase connection string
DATABASE_URL="postgresql://postgres:[YOUR_PASSWORD]@db.[YOUR_PROJECT].supabase.co:5432/postgres"

# OpenAI - Replace with your API key
OPENAI_API_KEY="sk-your-openai-api-key-here"

# Supabase - Replace with your project details
SUPABASE_URL="https://[YOUR_PROJECT].supabase.co"
SUPABASE_ANON_KEY="eyJ[your-anon-key]"

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=*
```

**Create `tsconfig.json`** (use the artifact provided)

**Update `package.json`** (use the artifact provided)

### 5. Initialize Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (creates tables)
npx prisma db push

# Optional: Open Prisma Studio to view database
npx prisma studio
```

### 6. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# The server should start on http://localhost:3001
```

You should see:
```
=================================
🚀 SOAPify API Server Running
📡 Port: 3001
🌍 Environment: development
=================================
```

### 7. Test the API

Open the provided `src/index.html` file in your browser or use:

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test status endpoint
curl http://localhost:3001/api/status
```

## 📡 API Endpoints

### Health & Status
- `GET /health` - Basic health check
- `GET /api/status` - Detailed service status

### User Management
- `POST /api/users` - Create or get user
  ```json
  { "email": "doctor@example.com", "name": "Dr. Smith" }
  ```
- `GET /api/users/:id` - Get user by ID
- `GET /api/users/email/:email` - Get user by email
- `PUT /api/users/:id` - Update user
- `GET /api/users/:userId/stats` - Get user statistics

### Note Processing
- `POST /api/notes/upload` - Upload audio and generate SOAP note
  - Form data: `audio` (file), `userId`, `title` (optional)
  - Returns: Transcription + SOAP structured note
  
- `POST /api/notes/text` - Process text (no audio)
  ```json
  { "userId": "...", "text": "Patient presents with...", "title": "..." }
  ```

### Note Management
- `GET /api/notes/user/:userId` - Get all notes for user
  - Query params: `limit`, `offset`, `search`
- `GET /api/notes/:id` - Get single note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note
- `POST /api/notes/bulk-delete` - Delete multiple notes

## 🧪 Testing with HTML Interface

1. Open the provided `src/index.html` in your browser
2. Configure API URL (should be `http://localhost:3001`)
3. Test connection
4. Create a user
5. Record audio or enter text
6. View generated SOAP notes

## 📁 Project Structure

```
soapify-backend/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── server.ts              # Main API server
│   └── index.html             # Testing interface
├── uploads/                   # Temporary audio storage (gitignored)
├── .env                       # Environment variables (gitignored)
├── .gitignore                 # Git ignore file
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript config
├── render.yaml                # Render deployment config
└── README.md                  # This file
```

## 🔒 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string from Supabase | ✅ |
| `OPENAI_API_KEY` | OpenAI API key for Whisper & GPT | ✅ |
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | ✅ |
| `PORT` | Server port (default: 3001) | ❌ |
| `NODE_ENV` | Environment (development/production) | ❌ |
| `FRONTEND_URL` | Frontend URL for CORS (default: *) | ❌ |

## 🚢 Deployment to Render

### Option 1: Deploy from GitHub

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repository
4. Configure:
   - **Name**: soapify-backend
   - **Environment**: Node
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npm start`
5. Add environment variables (all the ones from `.env`)
6. Click "Create Web Service"

### Option 2: Build Script

**Create `build.sh`** in root:
```bash
#!/usr/bin/env bash
npm install
npx prisma generate
npm run build
```

Make it executable: `chmod +x build.sh`

Then on Render:
- Build Command: `./build.sh`
- Start Command: `node dist/server.js`

### Important Deployment Notes

1. **Database URL**: Use the Supabase connection string (not localhost)
2. **File Uploads**: Render has ephemeral storage, so files in `/uploads` are temporary
3. **Environment**: Set `NODE_ENV=production`
4. **CORS**: Update `FRONTEND_URL` to your actual frontend domain

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test database connection
npx prisma studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Regenerate Prisma client
npx prisma generate
```

### OpenAI API Issues

- **Error: Invalid API key** → Check your `OPENAI_API_KEY` in `.env`
- **Error: Rate limit** → Wait a few minutes, OpenAI has usage limits
- **Error: Insufficient credits** → Add credits to your OpenAI account

### Supabase Storage Issues

- **Error: Bucket not found** → Create `audio-files` bucket in Supabase dashboard
- **Error: Permission denied** → Make bucket PUBLIC in settings
- **Error: File upload fails** → Check your `SUPABASE_ANON_KEY`

### Port Already in Use

```bash
# Kill process on port 3001 (Mac/Linux)
lsof -ti:3001 | xargs kill -9

# Or use different port
PORT=3002 npm run dev
```

### TypeScript Errors

```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install

# Regenerate Prisma client
npx prisma generate
```

## 📊 Database Schema

### User Table
- `id` (UUID, primary key)
- `email` (unique)
- `name` (optional)
- `createdAt` (timestamp)

### Note Table
- `id` (UUID, primary key)
- `title` (optional)
- `subjective` (text)
- `objective` (text)
- `assessment` (text)
- `plan` (text)
- `rawInput` (original transcription)
- `audioUrl` (link to Supabase storage)
- `createdAt` (timestamp)
- `userId` (foreign key to User)

## 🎯 API Response Examples

### Successful Note Creation
```json
{
  "success": true,
  "note": {
    "id": "uuid",
    "title": "Follow-up Visit",
    "subjective": "Patient reports improved symptoms...",
    "objective": "BP 120/80, HR 72...",
    "assessment": "Condition improving...",
    "plan": "Continue current medications...",
    "rawInput": "Original transcription...",
    "audioUrl": "https://...supabase.co/audio-files/...",
    "createdAt": "2025-01-15T10:30:00Z",
    "userId": "uuid",
    "user": {
      "id": "uuid",
      "email": "doctor@example.com",
      "name": "Dr. Smith"
    }
  },
  "processing": {
    "transcription_length": 450,
    "audio_url": "https://..."
  }
}
```

### Error Response
```json
{
  "error": "Failed to process audio",
  "message": "Invalid file type. Only audio files are allowed."
}
```

## 🔐 Security Best Practices

1. **Never commit `.env`** - Add to `.gitignore`
2. **Use HTTPS** in production
3. **Validate all inputs** - Already implemented
4. **Rate limiting** - Consider adding for production
5. **API authentication** - Add JWT tokens for production use

## 🚀 Performance Tips

1. **Database Indexing** - Already configured on `userId` and `createdAt`
2. **Audio Size Limits** - Set to 25MB (configurable in multer config)
3. **Pagination** - Implemented with `limit` and `offset` params
4. **Caching** - Consider Redis for frequently accessed notes

## 📝 Next Steps

1. ✅ Backend is complete
2. ⏭️ Build your custom frontend on Vercel
3. 🎨 Use these API endpoints in your frontend
4. 🚢 Deploy both frontend and backend
5. 🏆 Demo at HackUMass!

## 🤝 Frontend Integration Guide

Your Vercel frontend should:

1. **Call** `POST /api/users` to create/login users
2. **Record audio** in the browser using MediaRecorder API
3. **Upload** to `POST /api/notes/upload` with FormData
4. **Display** the returned SOAP note
5. **List notes** using `GET /api/notes/user/:userId`
6. **Allow editing** via `PUT /api/notes/:id`

Example fetch call:
```javascript
// Upload audio
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('userId', userId);

const response = await fetch('https://your-backend.onrender.com/api/notes/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result.note); // SOAP structured note
```

## 📄 License

MIT License - Built for HackUMass XIII

---

**Built with ❤️ using Node.js, OpenAI, and Supabase**

Good luck at HackUMass! 🏆