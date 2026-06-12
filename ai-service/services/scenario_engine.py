"""
scenario_engine.py

Turns the six "quick activity" buttons in the app (محادثة، كلمة اليوم، الحروف
العبرية، استماع، اختبار قصير، نصيحة ثقافية) into real chatbot MODES instead of
cosmetic opening lines.

Each scenario id maps to a behaviour spec that produces:
  - a system prompt that makes the model LEAD an activity (role-play a waiter,
    run a quiz, teach one word ...), tailored to the learner's level, and
  - an in-character opening line.

The defining rule across every scenario: the model must NEVER tell the learner
their message is "out of scope" and must NEVER end the activity. If the learner
drifts, it re-anchors them with a new question that fits the scene. This is the
behaviour the generic tutor prompt could not provide.

Scope is governed by LEVEL DIFFICULTY (curriculum.py), not a fixed topic
blacklist — the same engine that complexity_checker.py already uses.
"""
from __future__ import annotations

from dataclasses import dataclass

from services.curriculum import get_curriculum, normalize_level

# Valid scenario ids — these match the route ids used by the frontend
# (frontend/src/pages/ScenarioChat.jsx).
SPEAKING = "speaking"
DAILY_WORD = "daily-word"
LETTERS = "letters"
LISTENING = "listening"
QUIZ = "quiz"
CULTURE = "culture"

# Answer length per level (mirrors the caps in chat_guardrails._LEVEL_CONFIGS so
# scenario replies stay at the same length budget as the rest of the tutor).
_MAX_WORDS_BY_LEVEL = {"A1": 12, "A2": 20, "B1": 35, "B2": 50}


@dataclass(frozen=True)
class _RolePlaySetting:
    """A level-appropriate real-world role-play scene for the محادثة activity."""
    role_he: str          # the character the model plays, in Hebrew
    setting_he: str       # where the scene takes place, in Hebrew
    opening_he: str       # the character's first line
    opening_ar: str       # Arabic mirror of the opening (served only on request)
    topics: tuple[str, ...]  # curriculum topic keys that feed the scene's words


# Role-play scene per level. A1 starts at the simplest daily situation (a cafe)
# and the scenes grow with the level, all the way to a B2 workplace exchange.
_ROLEPLAY_BY_LEVEL: dict[str, _RolePlaySetting] = {
    "A1": _RolePlaySetting(
        role_he="מלצר",
        setting_he="בית קפה",
        opening_he="שלום וברוכים הבאים לבית הקפה! מה תרצה להזמין?",
        opening_ar="أهلاً وسهلاً بالمقهى! شو بتحب تطلب؟",
        topics=("greetings", "food", "places"),
    ),
    "A2": _RolePlaySetting(
        role_he="מוכר בחנות",
        setting_he="חנות בשכונה",
        opening_he="שלום! ברוכים הבאים לחנות. במה אפשר לעזור?",
        opening_ar="أهلاً! نوّرت المحل. كيف بقدر أساعدك؟",
        topics=("food", "places", "time"),
    ),
    "B1": _RolePlaySetting(
        role_he="פקיד קבלה",
        setting_he="מרפאה",
        opening_he="שלום, הגעת למרפאה. איך אפשר לעזור לך היום?",
        opening_ar="أهلاً، وصلت للعيادة. كيف بقدر أساعدك اليوم؟",
        topics=("health", "services", "work"),
    ),
    "B2": _RolePlaySetting(
        role_he="עמית לעבודה",
        setting_he="משרד",
        opening_he="שלום, נעים מאוד. בוא נדבר קצת על העבודה — ספר לי על עצמך.",
        opening_ar="أهلاً، تشرفنا. خلينا نحكي شوي عن الشغل — احكيلي عن حالك.",
        topics=("work", "services", "public_life"),
    ),
}


@dataclass(frozen=True)
class _ScenarioSpec:
    """Static description of one activity, independent of level."""
    scenario_id: str
    title_he: str
    # Builds the activity-specific block of the system prompt. Receives the
    # resolved level and a comma-joined preview of that level's words.
    behaviour: str
    # Default (level-agnostic) opening for non-role-play activities.
    opening_he: str = ""
    opening_ar: str = ""


_SCENARIOS: dict[str, _ScenarioSpec] = {
    SPEAKING: _ScenarioSpec(
        scenario_id=SPEAKING,
        title_he="שיחה",
        # behaviour for speaking is generated per-level from _ROLEPLAY_BY_LEVEL.
        behaviour="",
    ),
    DAILY_WORD: _ScenarioSpec(
        scenario_id=DAILY_WORD,
        title_he="מילת היום",
        behaviour=(
            "Activity: WORD OF THE DAY. Pick exactly ONE useful word for this "
            "level from these words: {words}. Teach it: say the word, give its "
            "meaning in one simple Hebrew sentence, then ask the learner to use "
            "that same word in a short sentence. Stay on this ONE word across "
            "turns until the learner uses it well, then praise and offer the "
            "next word."
        ),
        opening_he="שלום! היום נלמד מילה אחת חדשה. מוכן להתחיל?",
        opening_ar="مرحبا! اليوم رح نتعلّم كلمة جديدة وحدة. جاهز نبلّش؟",
    ),
    LETTERS: _ScenarioSpec(
        scenario_id=LETTERS,
        title_he="אותיות עבריות",
        behaviour=(
            "Activity: HEBREW LETTERS. Practise ONE Hebrew letter at a time. "
            "Say the letter, its sound, and ONE simple example word that starts "
            "with it taken from these words: {words}. Then ask the learner to "
            "say the letter or another word with it. Move to the next letter "
            "only after the learner succeeds. Keep it light and encouraging."
        ),
        opening_he="שלום! היום נתרגל אות אחת בעברית. מוכן?",
        opening_ar="مرحبا! اليوم رح نتدرّب على حرف عبري واحد. جاهز؟",
    ),
    LISTENING: _ScenarioSpec(
        scenario_id=LISTENING,
        title_he="האזנה",
        behaviour=(
            "Activity: LISTENING. Say ONE short, simple Hebrew sentence built "
            "only from level-appropriate words ({words}), then ask the learner "
            "what they understood or to answer it. If they understood, praise "
            "briefly and give the NEXT short sentence. Keep every sentence very "
            "short and clear so it is easy to follow by ear."
        ),
        opening_he="שלום! אני אגיד משפט קצר, ואתה תנסה להבין. מוכן?",
        opening_ar="مرحبا! رح أحكي جملة قصيرة وإنت تحاول تفهمها. جاهز؟",
    ),
    QUIZ: _ScenarioSpec(
        scenario_id=QUIZ,
        title_he="חידון קצר",
        behaviour=(
            "Activity: SHORT QUIZ. Ask ONE short question at a time using "
            "level-appropriate vocabulary ({words}). Wait for the answer, say "
            "briefly whether it is correct (praise, or gently show the right "
            "answer), then immediately ask the NEXT question. Ask only one "
            "question per turn so the learner is never overwhelmed."
        ),
        opening_he="שלום! בוא נתחיל חידון קצר. שאלה ראשונה מגיעה!",
        opening_ar="مرحبا! خلينا نبلّش اختبار قصير. أول سؤال جاي!",
    ),
    CULTURE: _ScenarioSpec(
        scenario_id=CULTURE,
        title_he="טיפ תרבותי",
        behaviour=(
            "Activity: CULTURAL TIP. Share ONE short, friendly tip about daily "
            "life and culture in Israel (greetings, food, customs, manners) in "
            "simple Hebrew, then ask the learner a light question to start a "
            "small related conversation. Stay warm, simple, and concrete — one "
            "tip at a time."
        ),
        opening_he="שלום! יש לי טיפ קטן על החיים בארץ. רוצה לשמוע?",
        opening_ar="مرحبا! عندي نصيحة صغيرة عن الحياة بالبلد. بتحب تسمعها؟",
    ),
}


def is_scenario(scenario_id: str | None) -> bool:
    """True when scenario_id names a known activity mode."""
    return bool(scenario_id) and scenario_id in _SCENARIOS


def scenario_title(scenario_id: str) -> str:
    spec = _SCENARIOS.get(scenario_id)
    return spec.title_he if spec else ""


def _level_words(level: str, topics: tuple[str, ...] | None = None) -> list[str]:
    """Curriculum words for the level, optionally restricted to given topics."""
    curriculum = get_curriculum(level)
    words: list[str] = []
    items = curriculum.words_by_topic.items()
    for topic, topic_words in items:
        if topics is None or topic in topics:
            for w in topic_words:
                if w not in words:
                    words.append(w)
    # Fall back to the whole level if the requested topics had no words.
    if not words:
        for topic_words in curriculum.words_by_topic.values():
            for w in topic_words:
                if w not in words:
                    words.append(w)
    return words


def _common_header(level: str, include_arabic: bool) -> str:
    max_words = _MAX_WORDS_BY_LEVEL.get(level, 12)
    arabic_rule = (
        "You MAY add at most ONE short Arabic line AFTER the Hebrew, and only "
        "if the learner seems stuck."
        if include_arabic
        else "Do not use Arabic or English."
    )
    return (
        f"You are a warm, proactive Hebrew tutor for Arabic-speaking learners "
        f"inside the Lisan app, running an interactive activity at Level {level}. "
        f"You LEAD the activity like a real teacher in a real situation.\n\n"
        f"Hard rules for every turn (write in Hebrew):\n"
        f"- Write in Hebrew only. {arabic_rule}\n"
        f"- Stay at Level {level}. Use simple, level-appropriate words and forms.\n"
        f"- Keep your reply to 2-3 short sentences, up to {max_words} Hebrew words.\n"
        f"- YOU drive the activity. ALWAYS end your turn with ONE short question "
        f"that moves the activity forward.\n"
        f"- If the learner drifts off the activity, gently steer them back with a "
        f"NEW question that fits the scene. NEVER say their message is out of "
        f"scope, NEVER refuse, and NEVER end the activity.\n"
        f"- Never write long paragraphs, lists, headings, or grammar lectures.\n"
    )


def _speaking_behaviour(level: str) -> str:
    setting = _ROLEPLAY_BY_LEVEL.get(level, _ROLEPLAY_BY_LEVEL["A1"])
    words = ", ".join(_level_words(level, setting.topics))
    return (
        f"Activity: ROLE-PLAY conversation. You play the character of a "
        f"{setting.role_he} ({setting.setting_he}). Stay in character the whole "
        f"time and make it feel real: greet the learner, ask what they need, "
        f"react naturally, and keep the scene moving. The learner is the "
        f"customer/visitor. Useful words for this scene: {words}."
    )


def build_scenario_prompt(
    scenario_id: str,
    level: str | None,
    include_arabic: bool = False,
) -> str:
    """Full system prompt for an activity at a level.

    Reuses curriculum.py for the level's words so vocabulary scope is never
    duplicated here. Raises KeyError for an unknown scenario id (callers gate
    on is_scenario first).
    """
    resolved_level = normalize_level(level)
    spec = _SCENARIOS[scenario_id]
    header = _common_header(resolved_level, include_arabic)

    if scenario_id == SPEAKING:
        behaviour = _speaking_behaviour(resolved_level)
    else:
        words = ", ".join(_level_words(resolved_level))
        behaviour = spec.behaviour.format(words=words)

    return f"{header}\n{behaviour}"


def scenario_opening(
    scenario_id: str,
    level: str | None,
    include_arabic: bool = False,
) -> tuple[str, str | None]:
    """In-character opening line for an activity.

    Returns (hebrew, arabic_or_None). The Arabic line is returned only when
    include_arabic is True — a learner who reads Arabic gets the scene framed in
    their L1, everyone else gets Hebrew only.
    """
    resolved_level = normalize_level(level)
    if scenario_id == SPEAKING:
        setting = _ROLEPLAY_BY_LEVEL.get(resolved_level, _ROLEPLAY_BY_LEVEL["A1"])
        he, ar = setting.opening_he, setting.opening_ar
    else:
        spec = _SCENARIOS[scenario_id]
        he, ar = spec.opening_he, spec.opening_ar
    return he, (ar if include_arabic else None)
