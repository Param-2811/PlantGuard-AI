# PlantGuard AI - Complete Setup Guide

## Prerequisites

Before you begin, make sure you have:

- **Python 3.9+** installed (https://python.org)
- **Node.js 18+** installed (https://nodejs.org)
- **Ollama Cloud API key** (for cloud LLM access)

---

## Step 1: Configure Cloud LLM

Create `backend/.env` with:

```env
LLM_PROVIDER=ollama_cloud
OLLAMA_API_KEY=your_ollama_api_key_here
OLLAMA_MODEL=qwen3-next:80b
```

> **Note:** Ollama Cloud uses the same API style with base URL `https://ollama.com/api` and requires `OLLAMA_API_KEY`.

---

## Step 2: Train the Model (Optional - Pre-trained Weights Included)

If you want to train the model yourself or use a custom dataset:

```bash
cd training
```

Edit `train.py` and set `DATASET_PATH` to your PlantVillage dataset folder:

```python
DATASET_PATH = "path/to/your/plantvillage/dataset/color"
```

Run training:

```bash
python train.py
```

The trained model will be saved automatically to `backend/weights/efficientnet_plant.pth`.

> **Note:** Training takes 2-4 hours on GPU, 8-12 hours on CPU.

---

## Step 3: Set Up the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Configure Environment Variables

The `.env` file should contain:

```
OLLAMA_API_KEY=your_ollama_api_key_here
OLLAMA_MODEL=qwen3-next:80b
LLM_PROVIDER=ollama_cloud
```

> **Important:** The app now uses cloud LLM providers by default.

---

## Step 4: Set Up the Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Build for production (optional)
npm run build
```

---

## Step 5: Run the Application

### Option A: Use Launcher Scripts (Recommended for Windows)

From the main `plantguard-ai` folder:

```bash
# Start all services (Backend + Frontend)
.\start_all_servers.ps1

# To stop all services
.\stop_all_servers.ps1

# To check status of all services
.\check_status.bat
```

### Option B: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
venv\Scripts\activate  # or source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 - Frontend (Next.js):**
```bash
cd frontend
npm run dev
```

The app will be available at **http://localhost:3000** (Next.js default port).

## Step 6: Open the App

Open your browser and go to:

**http://localhost:3000** (Next.js default port)

You should see the PlantGuard AI interface with a drag-and-drop upload area.

---

## Troubleshooting

### Cloud LLM errors

1. Verify `backend/.env` has a valid `OLLAMA_API_KEY`
2. Confirm provider setting: `LLM_PROVIDER=ollama_cloud` (or `ollama_local` for local Ollama)
3. Check backend logs for API status code details

### Backend won't start

1. Check if port 8000 is already in use
2. Make sure all dependencies are installed: `pip install -r requirements.txt`
3. Check logs in `logs/backend.err.log`

### Frontend won't start

1. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
2. Check if port 3000 is already in use
3. Clear Next.js cache: `rm -rf .next`
4. Check logs in `logs/frontend.err.log`

### "Failed to load model" error

1. Make sure `backend/weights/efficientnet_plant.pth` exists
2. If not, either train the model or download pre-trained weights

### Chat feature not working

1. Verify your cloud API key is valid and active
2. Check model name in env (`qwen3-next:80b`)
3. Backend logs will show provider-specific connection errors

---

## Ports Used

| Service | Port | URL |
|---------|------|-----|
| Frontend (Next.js) | 3000 | http://localhost:3000 |
| Backend API | 8000 | http://localhost:8000/docs |
| Ollama (local, optional) | 11434 | http://localhost:11434/api/tags |

---

## Project Structure

```
plantguard-ai/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── model.py             # Plant disease classifier
│   ├── llm.py               # Ollama Cloud/local LLM integration
│   ├── classes.py           # 38 disease class names
│   ├── diseases.json        # Disease-specific knowledge base
│   ├── requirements.txt     # Python dependencies
│   └── weights/             # Model weights folder
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main application component
│   │   ├── components/      # React components
│   │   └── index.css        # Tailwind CSS + custom styles
│   └── package.json
│
├── training/
│   ├── train.py             # Model training script
│   ├── dataset.py           # Dataset loader with augmentations
│   └── evaluate.py          # Model evaluation script
│
└── logs/                    # Application logs
```

---

## Features

- **Two-stage AI pipeline:** EfficientNet-B6 for disease detection + cloud LLM for advice
- **Cloud-first LLM:** Supports Ollama Cloud API
- **Knowledge base fallback:** Disease-specific advice when LLM is unavailable
- **Context-aware chatbot:** Ask follow-up questions about detected diseases
- **Plant validation:** Rejects non-plant images to reduce false positives
- **Class imbalance handling:** Weighted sampling for fair training
- **Modern UI:** React + Tailwind CSS with smooth animations

---

## API Endpoints

### POST /analyze
Upload an image for disease analysis.

**Request:** `multipart/form-data` with `file` field  
**Response:**
```json
{
  "raw_class": "Tomato___Early_blight",
  "disease": "Early blight",
  "plant": "Tomato",
  "confidence": 94.52,
  "is_healthy": false,
  "advice": "## 🔍 Disease Overview..."
}
```

### POST /chat
Ask a follow-up question about a detected disease.

**Request:**
```json
{
  "disease": "Early blight",
  "plant": "Tomato",
  "question": "What fungicide should I use?"
}
```

**Response:**
```json
{
  "response": "For Early blight on Tomato..."
}
```

---

## Support

For issues or questions:
1. Check the logs in `logs/` folder
2. Run `check_status.bat` to verify all services
3. Review this guide for troubleshooting steps
