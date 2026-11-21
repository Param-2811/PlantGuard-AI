import json
import os
from pathlib import Path
from typing import Iterator, Optional

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set.")
    return value


# Sampling controls for the LLM. Raise the default temperature to increase
# diversity and add nucleus sampling (top_p) to reduce repetitive outputs.
LLM_PROVIDER = _required_env("LLM_PROVIDER").lower()
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "").strip()
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "1.15"))
LLM_TOP_P = float(os.getenv("LLM_TOP_P", "0.97"))

OLLAMA_LOCAL_BASE = os.getenv("OLLAMA_LOCAL_BASE", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_CLOUD_BASE = os.getenv("OLLAMA_CLOUD_BASE", "https://ollama.com").rstrip("/")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "").strip()

OPENROUTER_BASE = os.getenv("OPENROUTER_BASE", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b:free").strip()

if LLM_PROVIDER.startswith("ollama") and not OLLAMA_MODEL:
    raise RuntimeError("OLLAMA_MODEL must be set.")


def _provider_order() -> list[str]:
    valid = {"ollama_cloud", "ollama_local", "openrouter"}
    if LLM_PROVIDER not in valid:
        raise RuntimeError(
            "Invalid LLM_PROVIDER. Use one of: ollama_cloud, ollama_local, openrouter"
        )
    return [LLM_PROVIDER]


def get_llm_runtime_info() -> dict:
    return {
        "provider": LLM_PROVIDER,
        "model": OPENROUTER_MODEL if LLM_PROVIDER == "openrouter" else OLLAMA_MODEL,
    }


def _ollama_headers(api_key: Optional[str] = None) -> dict[str, str]:
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _chat_payload(messages: list[dict], model: str, stream: bool) -> dict:
    return {
        "model": model,
        "messages": messages,
        "stream": stream,
        "options": {
            "temperature": LLM_TEMPERATURE,
            "top_p": LLM_TOP_P,
            "top_k": int(os.getenv("LLM_TOP_K", "80")),
            "repeat_penalty": float(os.getenv("LLM_REPEAT_PENALTY", "1.15")),
        },
    }


def _extract_ollama_text(payload: dict) -> str:
    message = payload.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()

    response = payload.get("response")
    if isinstance(response, str) and response.strip():
        return response.strip()

    return ""


def _extract_ollama_chunk(payload: dict) -> str:
    message = payload.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str) and content:
            return content

    response = payload.get("response")
    if isinstance(response, str) and response:
        return response

    return ""


def _call_ollama(
    messages: list[dict],
    base_url: str,
    api_key: Optional[str] = None,
) -> str:
    headers = _ollama_headers(api_key)

    try:
        response = requests.post(
            f"{base_url}/api/chat",
            headers=headers,
            json=_chat_payload(messages, OLLAMA_MODEL, stream=False),
            timeout=120,
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"Ollama API returned HTTP {response.status_code}: {response.text[:300]}"
            )

        result = _extract_ollama_text(response.json())
        if not result:
            raise RuntimeError(f"Ollama response was empty for model {OLLAMA_MODEL}.")
        return result
    except requests.RequestException as e:
        raise RuntimeError(f"Cannot reach Ollama API at {base_url}.") from e


def _call_ollama_cloud(messages: list[dict]) -> str:
    if not OLLAMA_API_KEY:
        raise RuntimeError("OLLAMA_API_KEY is not set for ollama_cloud provider.")
    return _call_ollama(messages, OLLAMA_CLOUD_BASE, api_key=OLLAMA_API_KEY)


def _call_ollama_local(messages: list[dict]) -> str:
    return _call_ollama(messages, OLLAMA_LOCAL_BASE)


def _stream_ollama(
    messages: list[dict],
    base_url: str,
    api_key: Optional[str] = None,
) -> Iterator[str]:
    headers = _ollama_headers(api_key)

    try:
        with requests.post(
            f"{base_url}/api/chat",
            headers=headers,
            json=_chat_payload(messages, OLLAMA_MODEL, stream=True),
            timeout=(20, 300),
            stream=True,
        ) as response:
            if response.status_code != 200:
                raise RuntimeError(
                    f"Ollama API returned HTTP {response.status_code}: {response.text[:300]}"
                )

            saw_chunk = False
            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    continue

                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if payload.get("error"):
                    raise RuntimeError(f"Ollama API error: {payload['error']}")

                chunk = _extract_ollama_chunk(payload)
                if chunk:
                    saw_chunk = True
                    yield chunk

                if payload.get("done"):
                    break

            if not saw_chunk:
                raise RuntimeError(f"Ollama response was empty for model {OLLAMA_MODEL}.")
    except requests.RequestException as e:
        raise RuntimeError(f"Cannot reach Ollama API at {base_url}.") from e


def _stream_ollama_cloud(messages: list[dict]) -> Iterator[str]:
    if not OLLAMA_API_KEY:
        raise RuntimeError("OLLAMA_API_KEY is not set for ollama_cloud provider.")
    return _stream_ollama(messages, OLLAMA_CLOUD_BASE, api_key=OLLAMA_API_KEY)


def _stream_ollama_local(messages: list[dict]) -> Iterator[str]:
    return _stream_ollama(messages, OLLAMA_LOCAL_BASE)


def _openrouter_post(messages: list[dict], stream: bool) -> requests.Response:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set for openrouter provider.")
    try:
        response = requests.post(
            f"{OPENROUTER_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={
                "model": OPENROUTER_MODEL,
                "messages": messages,
                "stream": stream,
                "temperature": LLM_TEMPERATURE,
                "top_p": LLM_TOP_P,
                "top_k": int(os.getenv("LLM_TOP_K", "80")),
                "repetition_penalty": float(os.getenv("LLM_REPEAT_PENALTY", "1.15")),
            },
            timeout=(20, 300) if stream else 120,
            stream=stream,
        )
    except requests.RequestException as e:
        raise RuntimeError(f"Cannot reach OpenRouter API at {OPENROUTER_BASE}.") from e
    if response.status_code != 200:
        raise RuntimeError(
            f"OpenRouter API returned HTTP {response.status_code}: {response.text[:300]}"
        )
    return response


def _call_openrouter(messages: list[dict]) -> str:
    payload = _openrouter_post(messages, stream=False).json()
    choices = payload.get("choices") or [{}]
    result = (choices[0].get("message") or {}).get("content") or ""
    if not result.strip():
        raise RuntimeError(f"OpenRouter response was empty for model {OPENROUTER_MODEL}.")
    return result.strip()


def _stream_openrouter(messages: list[dict]) -> Iterator[str]:
    try:
        with _openrouter_post(messages, stream=True) as response:
            response.encoding = "utf-8"  # SSE has no charset; requests would default to latin-1 and mangle emojis
            saw_chunk = False
            for line in response.iter_lines(decode_unicode=True):
                # Skip blanks and ": OPENROUTER PROCESSING" keep-alive comments.
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if payload.get("error"):
                    raise RuntimeError(f"OpenRouter API error: {payload['error']}")
                choices = payload.get("choices") or [{}]
                chunk = (choices[0].get("delta") or {}).get("content")
                if chunk:
                    saw_chunk = True
                    yield chunk
            if not saw_chunk:
                raise RuntimeError(f"OpenRouter response was empty for model {OPENROUTER_MODEL}.")
    except requests.RequestException as e:
        raise RuntimeError(f"Cannot reach OpenRouter API at {OPENROUTER_BASE}.") from e


def stream_llm(messages: list[dict]) -> Iterator[str]:
    provider = _provider_order()[0]
    if provider == "openrouter":
        yield from _stream_openrouter(messages)
        return
    if provider == "ollama_cloud":
        yield from _stream_ollama_cloud(messages)
        return
    if provider == "ollama_local":
        yield from _stream_ollama_local(messages)
        return
    raise RuntimeError(f"Unsupported LLM provider: {provider}")


def _build_advice_prompt(disease: str, plant: str, confidence: float, is_healthy: bool) -> str:
    if is_healthy:
        return (
            f"You are an expert agronomist helping farmers. "
            f"A {plant} plant leaf was analyzed as healthy with confidence {confidence}%.\n\n"
            "Return markdown in this exact structure and order:\n"
            "## Healthy Plant Status\n"
            "- One short status line\n"
            "## Keep It Healthy\n"
            "- 4 to 6 actionable bullet points\n\n"
            "Formatting rules:\n"
            "- Use headings and bullet points only\n"
            "- Include 1-2 appropriate emojis in the bullets to make advice more engaging\n"
            "- Do not use tables\n"
            "- Do not use pipe characters |\n"
            "- Do not use separator lines like ---\n"
            "- Do not use HTML tags such as <br> or <b> — use plain markdown line breaks and bullets only\n"
            "- Keep wording farmer-friendly and practical"
        )

    return (
        f"You are an expert plant pathologist helping a farmer diagnose crop disease.\n\n"
        f"Plant: {plant}\n"
        f"Detected Disease: {disease}\n"
        f"Confidence: {confidence}%\n\n"
        "Return markdown in this exact structure and order:\n"
        "## Disease Overview\n"
        "- 5 to 6 bullets\n"
        "## Causes\n"
        "- 5 to 6 bullets\n"
        "## Visual Symptoms\n"
        "- 5 to 6 bullets\n"
        "## Treatment Plan\n"
        "- 5 to 8 actionable bullets\n"
        "## Prevention Tips\n"
        "- 5 to 6 bullets\n\n"
        "Formatting rules:\n"
        "- Use headings and bullet points only\n"
        "- Include 1-2 appropriate emojis in the bullets to make advice more engaging\n"
        "- Do not use tables\n"
        "- Do not use pipe characters |\n"
        "- Do not use separator lines like ---\n"
        "- Do not use HTML tags such as <br> or <b> — use plain markdown line breaks and bullets only\n"
        "- No long paragraphs\n"
        "- Keep language clear, practical, and farmer-friendly"
    )


def _build_chat_system_prompt(disease: str, plant: str) -> str:
    is_healthy = disease.strip().lower() == "healthy"
    if is_healthy:
        context = f"The plant being discussed is a healthy {plant}."
    else:
        context = f"The plant is {plant}, diagnosed with {disease}."

    return (
        "You are an expert agronomist having an ongoing conversation with a farmer. "
        "You have deep scientific and practical knowledge about crop diseases, "
        "pesticide chemistry, soil health, and farming best practices.\n\n"
        f"{context}\n\n"
        "Guidelines:\n"
        "- This is a multi-turn conversation. Read the full message history before replying, "
        "and never repeat advice or a checklist you already gave earlier in this conversation.\n"
        "- If the farmer is just acknowledging you (e.g. \"thanks\", \"ok\", \"got it\", \"cool\"), "
        "reply with a brief, natural acknowledgement only — do not restate prior advice.\n"
        "- Otherwise, answer the new question directly and keep it systematic.\n"
        "- Don't ask the farmer to confirm the problem again; use the context above.\n"
        "- Use a couple of emojis to keep it engaging, but don't overdo it.\n"
        "- Do not use HTML tags such as <br> or <b> — use plain markdown line breaks and bullets only.\n"
        "- Keep language clear, practical, and farmer-friendly.\n"
        "- If the question is off-topic, briefly redirect to plant/crop care."
    )


def _build_chat_messages(
    disease: str, plant: str, history: list[dict], user_question: str
) -> list[dict]:
    messages = [{"role": "system", "content": _build_chat_system_prompt(disease, plant)}]
    for turn in history:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content.strip()})
    messages.append({"role": "user", "content": user_question})
    return messages


def call_llm(messages: list[dict]) -> str:
    errors = []
    for provider in _provider_order():
        try:
            if provider == "openrouter":
                return _call_openrouter(messages)
            if provider == "ollama_cloud":
                return _call_ollama_cloud(messages)
            if provider == "ollama_local":
                return _call_ollama_local(messages)
            errors.append(f"{provider}: unknown provider")
        except Exception as e:
            errors.append(f"{provider}: {e}")

    raise RuntimeError("All configured LLM providers failed. " + " | ".join(errors))


def stream_advice(disease: str, plant: str, confidence: float, is_healthy: bool) -> Iterator[str]:
    prompt = _build_advice_prompt(disease, plant, confidence, is_healthy)
    return stream_llm([{"role": "user", "content": prompt}])


def stream_chat_with_context(
    disease: str, plant: str, user_question: str, history: Optional[list[dict]] = None
) -> Iterator[str]:
    return stream_llm(_build_chat_messages(disease, plant, history or [], user_question))


def get_advice(disease: str, plant: str, confidence: float, is_healthy: bool) -> str:
    """Get advice via configured LLM provider(s)."""
    prompt = _build_advice_prompt(disease, plant, confidence, is_healthy)
    return call_llm([{"role": "user", "content": prompt}])


def chat_with_context(
    disease: str, plant: str, user_question: str, history: Optional[list[dict]] = None
) -> str:
    """Context-aware chatbot via configured LLM provider(s)."""
    return call_llm(_build_chat_messages(disease, plant, history or [], user_question))
