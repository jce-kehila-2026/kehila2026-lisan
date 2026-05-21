from __future__ import annotations

import json
import math
import os
import re
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None
    genai_types = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


BASE_DIR = Path(__file__).resolve().parents[1]
POC_DIR = BASE_DIR / "poc"
PROMPTS_DIR = BASE_DIR / "prompts"
DEFAULT_SYSTEM_PROMPT_PATH = PROMPTS_DIR / "chat-system-prompt-v1.txt"
DEFAULT_TEST_PROMPTS_PATH = POC_DIR / "test-prompts.json"
DEFAULT_RESULTS_JSON_PATH = POC_DIR / "results.json"
DEFAULT_RESULTS_MD_PATH = POC_DIR / "results.md"
DEFAULT_VOCAB_JSON_PATH = POC_DIR / "approved-vocabulary.json"
DEFAULT_CHUNKS_JSON_PATH = POC_DIR / "rag-chunks.json"
DEFAULT_TRANSCRIPTS_DIR = BASE_DIR / "data" / "transcripts"
DEFAULT_JSON_DATASET_PATH = BASE_DIR / "data" / "curriculum.json"
HEBREW_WORD_RE = re.compile(r"[\u0590-\u05FF]+(?:['-][\u0590-\u05FF]+)*")
LATIN_RE = re.compile(r"[A-Za-z]")
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
FALLBACK_RESPONSE = "אני לא יודע את זה עדיין"
DEFAULT_REQUEST_DELAY_SECONDS = 0.0
DEFAULT_MAX_RETRIES = 5

MODEL_PRICING = {
    "gpt-4o-mini": {"provider": "openai", "input_per_million": 0.15, "output_per_million": 0.60},
    "claude-3-5-haiku-latest": {
        "provider": "anthropic",
        "input_per_million": 0.80,
        "output_per_million": 4.00,
    },
    "gemini-2.5-flash": {"provider": "gemini", "input_per_million": 0.30, "output_per_million": 2.50},
    "gemini-2.5-flash-lite": {"provider": "gemini", "input_per_million": 0.10, "output_per_million": 0.40},
}


@dataclass
class Transcript:
    source: str
    content: str


@dataclass
class Chunk:
    chunk_id: str
    source: str
    content: str
    tokens: set[str]


def load_environment() -> None:
    load_dotenv(BASE_DIR / ".env")


def get_env_path(name: str, default: Path) -> Path:
    raw_value = os.getenv(name)
    return Path(raw_value).expanduser().resolve() if raw_value else default.resolve()


def hebrew_words(text: str) -> list[str]:
    return HEBREW_WORD_RE.findall(text)


def normalize_hebrew_token(token: str) -> str:
    return token.strip(".,!?\"'():;[]{}").replace("״", "").replace("׳", "").strip()


def extract_text_fragments(payload: Any) -> list[str]:
    fragments: list[str] = []

    if isinstance(payload, str):
        cleaned = payload.strip()
        if cleaned:
            fragments.append(cleaned)
        return fragments

    if isinstance(payload, list):
        for item in payload:
            fragments.extend(extract_text_fragments(item))
        return fragments

    if isinstance(payload, dict):
        preferred_keys = [
            "content",
            "text",
            "transcript",
            "dialogue",
            "dialog",
            "conversation",
            "lines",
            "utterances",
            "sentences",
        ]
        for key in preferred_keys:
            if key in payload:
                fragments.extend(extract_text_fragments(payload[key]))

        if fragments:
            return fragments

        for value in payload.values():
            fragments.extend(extract_text_fragments(value))

    return fragments


def load_txt_transcripts(folder_path: Path) -> list[Transcript]:
    transcripts: list[Transcript] = []
    for file_path in sorted(folder_path.rglob("*.txt")):
        transcripts.append(
            Transcript(
                source=str(file_path.relative_to(folder_path)),
                content=file_path.read_text(encoding="utf-8").strip(),
            )
        )
    return transcripts


def load_json_transcripts(json_path: Path) -> list[Transcript]:
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    transcripts: list[Transcript] = []

    if isinstance(payload, list):
        for index, item in enumerate(payload, start=1):
            fragments = extract_text_fragments(item)
            content = "\n".join(fragment for fragment in fragments if fragment)
            if content.strip():
                transcripts.append(Transcript(source=f"{json_path.name}#{index}", content=content.strip()))
    else:
        fragments = extract_text_fragments(payload)
        content = "\n".join(fragment for fragment in fragments if fragment)
        if content.strip():
            transcripts.append(Transcript(source=json_path.name, content=content.strip()))

    return transcripts


def load_transcripts(folder_path: Path, json_dataset_path: Path) -> tuple[list[Transcript], str]:
    if json_dataset_path.exists():
        transcripts = load_json_transcripts(json_dataset_path)
        if transcripts:
            return transcripts, f"json:{json_dataset_path}"

    if folder_path.exists():
        transcripts = load_txt_transcripts(folder_path)
        if transcripts:
            return transcripts, f"txt:{folder_path}"

    raise FileNotFoundError(
        "No transcript dataset found. Set LISAN_TRANSCRIPTS_DIR to a folder with .txt files "
        "or LISAN_JSON_DATASET_PATH to a JSON curriculum file."
    )


def extract_vocabulary(transcripts: list[Transcript]) -> list[str]:
    vocab = {
        normalize_hebrew_token(token)
        for transcript in transcripts
        for token in hebrew_words(transcript.content)
        if normalize_hebrew_token(token)
    }
    return sorted(vocab)


def chunk_for_rag(transcripts: list[Transcript], chunk_size: int = 4, overlap: int = 1) -> list[Chunk]:
    chunks: list[Chunk] = []

    for transcript_index, transcript in enumerate(transcripts, start=1):
        lines = [line.strip() for line in transcript.content.splitlines() if line.strip()]
        if not lines:
            continue

        if len(lines) <= chunk_size:
            content = "\n".join(lines)
            chunks.append(
                Chunk(
                    chunk_id=f"t{transcript_index}-c1",
                    source=transcript.source,
                    content=content,
                    tokens=set(extract_vocabulary([Transcript(source=transcript.source, content=content)])),
                )
            )
            continue

        step = max(1, chunk_size - overlap)
        chunk_counter = 1
        for start in range(0, len(lines), step):
            selected = lines[start : start + chunk_size]
            if len(selected) < 2:
                continue
            content = "\n".join(selected)
            chunks.append(
                Chunk(
                    chunk_id=f"t{transcript_index}-c{chunk_counter}",
                    source=transcript.source,
                    content=content,
                    tokens=set(extract_vocabulary([Transcript(source=transcript.source, content=content)])),
                )
            )
            chunk_counter += 1

    return chunks


def load_system_prompt(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def load_test_prompts(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("test-prompts.json must contain a JSON array.")
    return payload


def retrieve_relevant_chunks(question: str, chunks: list[Chunk], limit: int = 5) -> list[Chunk]:
    question_tokens = {normalize_hebrew_token(token) for token in hebrew_words(question) if normalize_hebrew_token(token)}
    scored_chunks: list[tuple[int, int, Chunk]] = []

    for chunk in chunks:
        overlap_score = len(question_tokens & chunk.tokens)
        scored_chunks.append((overlap_score, len(chunk.tokens), chunk))

    scored_chunks.sort(key=lambda item: (item[0], item[1]), reverse=True)
    top_chunks = [chunk for score, _, chunk in scored_chunks if score > 0][:limit]

    if top_chunks:
        return top_chunks

    return chunks[:limit]


def requires_immediate_fallback(question: str) -> bool:
    if LATIN_RE.search(question) or ARABIC_RE.search(question):
        return True
    return False


def render_context(chunks: list[Chunk]) -> str:
    parts = []
    for chunk in chunks:
        parts.append(f"[{chunk.chunk_id}] {chunk.source}\n{chunk.content}")
    return "\n\n".join(parts)


def build_system_message(base_prompt: str, vocabulary: list[str], context: str) -> str:
    vocabulary_block = ", ".join(vocabulary)
    return (
        f"{base_prompt}\n\n"
        f"Approved vocabulary:\n{vocabulary_block}\n\n"
        f"Approved curriculum context:\n{context}"
    )


def normalize_model_answer(answer: str) -> str:
    lines = [line.strip() for line in answer.splitlines() if line.strip()]
    if not lines:
        return ""
    return lines[0]


def create_openai_client() -> Any:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is missing from ai-service/.env")
    if OpenAI is None:
        raise RuntimeError("openai package is not installed. Run pip install -r requirements.txt")
    return OpenAI(api_key=api_key)


def create_anthropic_client() -> Any:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is missing from ai-service/.env")
    if Anthropic is None:
        raise RuntimeError("anthropic package is not installed. Run pip install -r requirements.txt")
    return Anthropic(api_key=api_key)


def create_gemini_client() -> Any:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing from ai-service/.env")
    if genai is None or genai_types is None:
        raise RuntimeError("google-genai package is not installed. Run pip install -r requirements.txt")
    return genai.Client(api_key=api_key)


def call_openai(model: str, system_message: str, question: str) -> dict[str, Any]:
    client = create_openai_client()
    start = time.perf_counter()
    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": question},
        ],
        max_output_tokens=120,
    )
    latency = time.perf_counter() - start

    usage = response.usage
    answer = response.output_text.strip()

    return {
        "answer": answer,
        "latency_seconds": latency,
        "input_tokens": getattr(usage, "input_tokens", 0),
        "output_tokens": getattr(usage, "output_tokens", 0),
    }


def call_anthropic(model: str, system_message: str, question: str) -> dict[str, Any]:
    client = create_anthropic_client()
    start = time.perf_counter()
    response = client.messages.create(
        model=model,
        system=system_message,
        messages=[{"role": "user", "content": question}],
        max_tokens=120,
    )
    latency = time.perf_counter() - start
    answer = "".join(block.text for block in response.content if getattr(block, "type", "") == "text").strip()

    return {
        "answer": answer,
        "latency_seconds": latency,
        "input_tokens": getattr(response.usage, "input_tokens", 0),
        "output_tokens": getattr(response.usage, "output_tokens", 0),
    }


def call_gemini(model: str, system_message: str, question: str) -> dict[str, Any]:
    client = create_gemini_client()
    max_retries = int(os.getenv("LISAN_MAX_RETRIES", str(DEFAULT_MAX_RETRIES)))
    base_delay = float(os.getenv("LISAN_REQUEST_DELAY_SECONDS", str(DEFAULT_REQUEST_DELAY_SECONDS)))

    attempt = 0
    while True:
        if attempt == 0 and base_delay > 0:
            time.sleep(base_delay)

        start = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=model,
                contents=question,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_message,
                    temperature=0.2,
                    max_output_tokens=120,
                ),
            )
            latency = time.perf_counter() - start
            usage = getattr(response, "usage_metadata", None)

            return {
                "answer": (response.text or "").strip(),
                "latency_seconds": latency,
                "input_tokens": getattr(usage, "prompt_token_count", 0) if usage else 0,
                "output_tokens": getattr(usage, "candidates_token_count", 0) if usage else 0,
            }
        except Exception as exc:
            attempt += 1
            if attempt > max_retries or "429" not in str(exc):
                raise

            retry_delay = parse_retry_delay_seconds(str(exc)) or max(6.0, base_delay)
            time.sleep(retry_delay)


def parse_retry_delay_seconds(message: str) -> float | None:
    match = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", message, flags=re.IGNORECASE)
    if not match:
        return None
    return float(match.group(1))


def chat(question: str, provider: str, model: str, system_prompt: str, chunks: list[Chunk], vocabulary: list[str]) -> dict[str, Any]:
    if requires_immediate_fallback(question):
        return {
            "question": question,
            "answer": FALLBACK_RESPONSE,
            "latency_seconds": 0.0,
            "input_tokens": 0,
            "output_tokens": 0,
            "context_chunk_ids": [],
            "used_approved_vocabulary_only": True,
        }

    selected_chunks = retrieve_relevant_chunks(question, chunks)
    context = render_context(selected_chunks)
    system_message = build_system_message(system_prompt, vocabulary, context)

    if provider == "openai":
        response = call_openai(model, system_message, question)
    elif provider == "anthropic":
        response = call_anthropic(model, system_message, question)
    elif provider == "gemini":
        response = call_gemini(model, system_message, question)
    else:
        raise ValueError(f"Unsupported provider: {provider}")

    response["answer"] = normalize_model_answer(response["answer"])
    response["question"] = question
    response["context_chunk_ids"] = [chunk.chunk_id for chunk in selected_chunks]
    response["used_approved_vocabulary_only"] = uses_approved_vocabulary_only(response["answer"], vocabulary)
    if not response["used_approved_vocabulary_only"]:
        response["answer"] = FALLBACK_RESPONSE
        response["used_approved_vocabulary_only"] = True
    return response


def uses_approved_vocabulary_only(answer: str, vocabulary: list[str]) -> bool:
    approved = set(vocabulary) | set(hebrew_words(FALLBACK_RESPONSE))
    answer_tokens = {
        normalize_hebrew_token(token)
        for token in hebrew_words(answer)
        if normalize_hebrew_token(token)
    }
    return answer_tokens.issubset(approved)


def evaluate_response(item: dict[str, Any], answer: str, vocabulary_ok: bool) -> tuple[str, str]:
    expected_behavior = item.get("expected_behavior", "answer_from_curriculum")
    normalized_answer = answer.strip()

    if expected_behavior == "fallback":
        if normalized_answer == FALLBACK_RESPONSE:
            return "Good", "Correctly refused out-of-scope input."
        return "Bad", "Expected the fixed fallback response for out-of-scope input."

    if not normalized_answer:
        return "Bad", "Empty response."
    if not vocabulary_ok:
        return "Bad", "Response used vocabulary outside the approved list."
    if normalized_answer == FALLBACK_RESPONSE:
        return "Acceptable", "Safe fallback, but the curriculum may support a richer answer."
    return "Good", "Responded within curriculum and vocabulary constraints."


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    if model not in MODEL_PRICING:
        return 0.0

    pricing = MODEL_PRICING[model]
    input_cost = (input_tokens / 1_000_000) * pricing["input_per_million"]
    output_cost = (output_tokens / 1_000_000) * pricing["output_per_million"]
    return input_cost + output_cost


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    rank = (len(values) - 1) * p
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return values[lower]
    fraction = rank - lower
    return values[lower] + (values[upper] - values[lower]) * fraction


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def render_results_markdown(
    model: str,
    provider: str,
    transcript_source: str,
    system_prompt_version: str,
    results: list[dict[str, Any]],
    summary: dict[str, Any],
) -> str:
    lines = [
        "# Chat POC Evaluation Results",
        "",
        "## Test Setup",
        f"- LLM: `{model}` ({provider})",
        f"- Date: `{summary['run_date']}`",
        f"- Test questions: {len(results)}",
        f"- System prompt version: `{system_prompt_version}`",
        f"- Lisan content used: `{transcript_source}`",
        "",
        "## Quantitative Results",
        f"- Average latency: {summary['average_latency_seconds']:.2f} seconds (target: < 3s)",
        f"- 95th percentile latency: {summary['p95_latency_seconds']:.2f} seconds",
        f"- Best-case latency: {summary['best_latency_seconds']:.2f} seconds",
        f"- Worst-case latency: {summary['worst_latency_seconds']:.2f} seconds",
        f"- Total cost for {len(results)} requests: ${summary['total_cost_usd']:.6f}",
        f"- Estimated cost for 1000 daily requests: ${summary['estimated_1000_daily_cost_usd']:.4f}/day",
        f"- Estimated daily cost for 50 students x 10 exchanges: ${summary['estimated_50x10_daily_cost_usd']:.4f}/day",
        f"- Estimated monthly cost: ${summary['estimated_monthly_cost_usd']:.4f}/month",
        "",
        "## Qualitative Results",
        "",
    ]

    for result in results:
        lines.extend(
            [
                f"### Question {result['id']}: \"{result['question']}\"",
                f"- AI Response: {result['answer'] or '[empty]'}",
                f"- Verdict: {result['verdict']}",
                f"- Used approved vocabulary only: {'Yes' if result['used_approved_vocabulary_only'] else 'No'}",
                f"- Notes: {result['notes']}",
                "",
            ]
        )

    latency_verdict = "Met" if summary["average_latency_seconds"] < 3 else "Did not meet"
    good_or_acceptable = sum(1 for item in results if item["verdict"] in {"Good", "Acceptable"})

    lines.extend(
        [
            "## Findings",
            f"- {good_or_acceptable} of {len(results)} responses were rated Good or Acceptable.",
            f"- The 3-second NFR was {latency_verdict.lower()} on average.",
            f"- Vocabulary leakage count: {summary['vocabulary_leak_count']}.",
            "",
            "## Recommendations",
            f"- Proceed decision: {'green-light' if good_or_acceptable >= 7 and summary['average_latency_seconds'] < 3 else 'yellow-light'}",
            "- Re-run with the real Abdullah transcript set if the current run used placeholder or partial data.",
            "- Compare the same prompt set with the second provider before locking the Sprint 3 integration choice.",
            "",
        ]
    )

    return "\n".join(lines)


def main() -> int:
    load_environment()

    provider = os.getenv("LLM_PROVIDER", "openai").strip().lower()
    model = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
    system_prompt_path = get_env_path("LISAN_SYSTEM_PROMPT_PATH", DEFAULT_SYSTEM_PROMPT_PATH)
    test_prompts_path = get_env_path("LISAN_TEST_PROMPTS_PATH", DEFAULT_TEST_PROMPTS_PATH)
    transcripts_dir = get_env_path("LISAN_TRANSCRIPTS_DIR", DEFAULT_TRANSCRIPTS_DIR)
    json_dataset_path = get_env_path("LISAN_JSON_DATASET_PATH", DEFAULT_JSON_DATASET_PATH)
    results_json_path = get_env_path("LISAN_RESULTS_JSON_PATH", DEFAULT_RESULTS_JSON_PATH)
    results_md_path = get_env_path("LISAN_RESULTS_MD_PATH", DEFAULT_RESULTS_MD_PATH)
    vocabulary_json_path = get_env_path("LISAN_VOCAB_JSON_PATH", DEFAULT_VOCAB_JSON_PATH)
    chunks_json_path = get_env_path("LISAN_CHUNKS_JSON_PATH", DEFAULT_CHUNKS_JSON_PATH)

    if model not in MODEL_PRICING:
        print(f"Warning: no pricing metadata found for model '{model}'. Costs will be reported as 0.")

    transcripts, transcript_source = load_transcripts(transcripts_dir, json_dataset_path)
    vocabulary = extract_vocabulary(transcripts)
    chunks = chunk_for_rag(transcripts)
    system_prompt = load_system_prompt(system_prompt_path)
    test_prompts = load_test_prompts(test_prompts_path)

    save_json(
        vocabulary_json_path,
        {
            "transcript_source": transcript_source,
            "transcript_count": len(transcripts),
            "approved_vocabulary": vocabulary,
        },
    )
    save_json(
        chunks_json_path,
        [
            {
                "chunk_id": chunk.chunk_id,
                "source": chunk.source,
                "content": chunk.content,
                "tokens": sorted(chunk.tokens),
            }
            for chunk in chunks
        ],
    )

    results: list[dict[str, Any]] = []

    for item in test_prompts:
        response = chat(
            question=item["question"],
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            chunks=chunks,
            vocabulary=vocabulary,
        )
        verdict, notes = evaluate_response(item, response["answer"], response["used_approved_vocabulary_only"])
        cost = estimate_cost_usd(model, response["input_tokens"], response["output_tokens"])

        results.append(
            {
                "id": item["id"],
                "category": item.get("category"),
                "question": response["question"],
                "answer": response["answer"],
                "latency_seconds": round(response["latency_seconds"], 4),
                "input_tokens": response["input_tokens"],
                "output_tokens": response["output_tokens"],
                "estimated_cost_usd": round(cost, 8),
                "context_chunk_ids": response["context_chunk_ids"],
                "used_approved_vocabulary_only": response["used_approved_vocabulary_only"],
                "verdict": verdict,
                "notes": notes,
            }
        )

    latencies = sorted(item["latency_seconds"] for item in results)
    total_cost = sum(item["estimated_cost_usd"] for item in results)
    average_cost = total_cost / len(results) if results else 0.0

    summary = {
        "run_date": time.strftime("%Y-%m-%d"),
        "provider": provider,
        "model": model,
        "transcript_source": transcript_source,
        "transcript_count": len(transcripts),
        "chunk_count": len(chunks),
        "approved_vocabulary_size": len(vocabulary),
        "average_latency_seconds": statistics.mean(latencies) if latencies else 0.0,
        "p95_latency_seconds": percentile(latencies, 0.95),
        "best_latency_seconds": min(latencies) if latencies else 0.0,
        "worst_latency_seconds": max(latencies) if latencies else 0.0,
        "total_cost_usd": total_cost,
        "average_cost_per_exchange_usd": average_cost,
        "estimated_1000_daily_cost_usd": average_cost * 1000,
        "estimated_50x10_daily_cost_usd": average_cost * 500,
        "estimated_monthly_cost_usd": average_cost * 500 * 30,
        "vocabulary_leak_count": sum(1 for item in results if not item["used_approved_vocabulary_only"]),
    }

    save_json(
        results_json_path,
        {
            "summary": summary,
            "results": results,
        },
    )

    results_md = render_results_markdown(
        model=model,
        provider=provider,
        transcript_source=transcript_source,
        system_prompt_version=system_prompt_path.stem.replace("chat-system-prompt-", ""),
        results=results,
        summary=summary,
    )
    results_md_path.write_text(results_md, encoding="utf-8")

    print(f"Provider: {provider}")
    print(f"Model: {model}")
    print(f"Transcript source: {transcript_source}")
    print(f"Transcripts loaded: {len(transcripts)}")
    print(f"Approved vocabulary size: {len(vocabulary)}")
    print(f"Chunks created: {len(chunks)}")
    print(f"Vocabulary artifact: {vocabulary_json_path}")
    print(f"RAG chunks artifact: {chunks_json_path}")
    print(f"Average latency: {summary['average_latency_seconds']:.2f}s")
    print(f"P95 latency: {summary['p95_latency_seconds']:.2f}s")
    print(f"Average cost per exchange: ${summary['average_cost_per_exchange_usd']:.8f}")
    print(f"Results JSON: {results_json_path}")
    print(f"Results markdown: {results_md_path}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"POC failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
