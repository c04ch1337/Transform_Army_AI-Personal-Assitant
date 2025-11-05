<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1d6PGEXnYoowlJnnp37aNe-ZqNKUm_uT3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the required API keys in [.env.local](.env.local) for your chosen LLM provider:
   - `OPENAI_API_KEY` for OpenAI
   - `ANTHROPIC_API_KEY` for Anthropic
   - `OPENROUTER_API_KEY` for OpenRouter
   - `OLLAMA_API_KEY` for Ollama (optional, local - default: http://localhost:11434)
   - `LMSTUDIO_API_KEY` for LMStudio (optional, local - default: http://localhost:1234)
   - `LOCAL_LLM_ENDPOINT` for Local LLM (custom endpoint, default: http://localhost:8000/v1/chat/completions)
   - `LOCAL_LLM_API_KEY` for Local LLM (optional, if your local server requires auth)
3. Run the app:
   `npm run dev`
