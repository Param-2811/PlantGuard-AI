# PlantGuard AI

AI-powered plant leaf disease detection and treatment advice.

Upload a photo of a leaf → an **EfficientNet-B6** model (PyTorch) identifies one of 38 PlantVillage classes with a confidence score → an LLM (Ollama Cloud / local Ollama / OpenRouter) returns treatment advice, with a built-in knowledge base as fallback. Follow-up questions are answered in a chat panel.

**Stack:** PyTorch · FastAPI · Next.js · Tailwind CSS

## Quick start

1. **Model weights** — download `efficientnet_plant.pth` from the [Releases page](../../releases) and put it in `backend/weights/`.
2. **API key** — copy `.env.example` to `backend/.env` and fill in your own key. Never commit `.env`.
3. **Backend**
   ```bash
   cd backend
   python -m venv venv && venv\Scripts\activate   # macOS/Linux: source venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --port 8000
   ```
4. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
5. Open http://localhost:3000 (API docs at http://localhost:8000/docs).

On Windows, `start.bat` launches both servers.

See [SETUP.md](SETUP.md) for the full guide and API reference.

## Training

Dataset: [PlantVillage](https://www.kaggle.com/datasets/abdallahalidev/plantvillage-dataset) (not included, ~54k images per variant). Set `DATASET_PATH` in `training/train.py` and `training/evaluate.py`, then run `python training/train.py`.

## License

[MIT](LICENSE)
