from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORTS_DIR = ROOT_DIR / "evals" / "reports"


TOPICS = [
    {
        "slug": "greetings_intro",
        "title": "Greetings and self introduction",
        "level": "A1",
        "he_topic": "היכרות וברכות",
        "need": "להציג את עצמי בכיתה",
        "word": "נעים מאוד",
        "phrase": "My name is Samer",
        "sentence": "קוראים לי סאמר ואני לומד עברית",
        "bad_sentence": "אני קוראים סאמר",
        "role": "תלמיד חדש",
        "answer": "אני גר בירושלים ולומד באוניברסיטה",
    },
    {
        "slug": "family",
        "title": "Family conversation",
        "level": "A1",
        "he_topic": "משפחה",
        "need": "לדבר על המשפחה שלי",
        "word": "אחות",
        "phrase": "I have two brothers",
        "sentence": "יש לי אח קטן ואחות גדולה",
        "bad_sentence": "יש לי שתי אח",
        "role": "חבר שמכיר את המשפחה",
        "answer": "אמא שלי מורה ואבא שלי עובד בחנות",
    },
    {
        "slug": "daily_routine",
        "title": "Daily routine",
        "level": "A1",
        "he_topic": "סדר יום",
        "need": "לתאר את היום שלי",
        "word": "בבוקר",
        "phrase": "I wake up early",
        "sentence": "בבוקר אני שותה קפה והולך לשיעור",
        "bad_sentence": "אני הולך שיעור בבוקר",
        "role": "חבר לכיתה",
        "answer": "בערב אני חוזר הביתה ועושה שיעורי בית",
    },
    {
        "slug": "university_class",
        "title": "University classroom",
        "level": "A1",
        "he_topic": "באוניברסיטה",
        "need": "לשאול איפה הכיתה",
        "word": "שיעור",
        "phrase": "Where is the classroom?",
        "sentence": "השיעור מתחיל בשעה תשע",
        "bad_sentence": "השיעור מתחילים בתשע",
        "role": "מזכירות סטודנטים",
        "answer": "אני צריך למצוא את הבניין החדש",
    },
    {
        "slug": "cafe_order",
        "title": "Cafe order",
        "level": "A1",
        "he_topic": "בבית קפה",
        "need": "להזמין קפה ועוגה",
        "word": "תפריט",
        "phrase": "I want coffee with milk",
        "sentence": "אני רוצה קפה עם חלב ועוגה קטנה",
        "bad_sentence": "אני רוצה קפה עם חלבית",
        "role": "מלצר",
        "answer": "כמה עולה קפה הפוך?",
    },
    {
        "slug": "restaurant",
        "title": "Restaurant meal",
        "level": "A1",
        "he_topic": "במסעדה",
        "need": "להזמין אוכל במסעדה",
        "word": "מנה",
        "phrase": "Can I get water?",
        "sentence": "אני רוצה סלט ומים בבקשה",
        "bad_sentence": "אני רוצה מים וסלטים אחד",
        "role": "מלצרית",
        "answer": "האוכל טעים אבל המנה קטנה",
    },
    {
        "slug": "supermarket",
        "title": "Supermarket shopping",
        "level": "A1",
        "he_topic": "בסופר",
        "need": "לקנות לחם וחלב",
        "word": "קופה",
        "phrase": "How much does milk cost?",
        "sentence": "אני צריך לחם, חלב ועגבניות",
        "bad_sentence": "אני צריך לחם חלב ועגבניהים",
        "role": "קופאי",
        "answer": "איפה המדף של הפירות?",
    },
    {
        "slug": "market",
        "title": "Open market",
        "level": "A1",
        "he_topic": "בשוק",
        "need": "לקנות ירקות ופירות",
        "word": "קילו",
        "phrase": "This is too expensive",
        "sentence": "אני רוצה קילו עגבניות ושני מלפפונים",
        "bad_sentence": "אני רוצה שתי קילו עגבניות",
        "role": "מוכר בשוק",
        "answer": "המחיר קצת יקר בשבילי",
    },
    {
        "slug": "clothing_store",
        "title": "Clothing store",
        "level": "A1",
        "he_topic": "בחנות בגדים",
        "need": "לקנות חולצה במידה שלי",
        "word": "מידה",
        "phrase": "Do you have blue?",
        "sentence": "החולצה הזאת יפה אבל היא קטנה",
        "bad_sentence": "החולצה יפה אבל הוא קטן",
        "role": "מוכר בגדים",
        "answer": "אני מחפש צבע כחול או שחור",
    },
    {
        "slug": "bus_station",
        "title": "Bus station",
        "level": "A1",
        "he_topic": "בתחנת אוטובוס",
        "need": "לשאול על קו לירושלים",
        "word": "תחנה",
        "phrase": "When does the bus arrive?",
        "sentence": "האוטובוס מגיע עוד עשר דקות",
        "bad_sentence": "האוטובוס מגיעים עוד עשר דקות",
        "role": "נהג אוטובוס",
        "answer": "אני צריך לרדת בתחנה הבאה",
    },
    {
        "slug": "light_rail",
        "title": "Light rail ticket",
        "level": "A2",
        "he_topic": "ברכבת הקלה",
        "need": "להבין איך מתקפים כרטיס",
        "word": "לתקף",
        "phrase": "I forgot to validate my ticket",
        "sentence": "שכחתי לתקף את הכרטיס בתחנה",
        "bad_sentence": "שכחתי מתקף את הכרטיס",
        "role": "פקח ברכבת",
        "answer": "יש לי כרטיס אבל לא הבנתי איפה מתקפים",
    },
    {
        "slug": "directions",
        "title": "Asking for directions",
        "level": "A1",
        "he_topic": "הכוונה ברחוב",
        "need": "לשאול איך להגיע לדואר",
        "word": "ימינה",
        "phrase": "Go straight and turn left",
        "sentence": "לך ישר ואז תפנה שמאלה",
        "bad_sentence": "לך ישר ואז פונה שמאלה",
        "role": "עובר אורח",
        "answer": "אני מחפש את הרחוב הראשי",
    },
    {
        "slug": "clinic_appointment",
        "title": "Clinic appointment",
        "level": "A2",
        "he_topic": "קביעת תור במרפאה",
        "need": "לקבוע תור לרופא",
        "word": "תור",
        "phrase": "I need an appointment today",
        "sentence": "אני צריך תור לרופא משפחה היום",
        "bad_sentence": "אני צריך תור לרופא משפחה בהיום",
        "role": "מזכירה במרפאה",
        "answer": "יש לי כאב ראש וחום",
    },
    {
        "slug": "doctor_symptoms",
        "title": "Doctor symptoms",
        "level": "A2",
        "he_topic": "אצל הרופא",
        "need": "להסביר מה כואב לי",
        "word": "כואב",
        "phrase": "My throat hurts",
        "sentence": "כואב לי הגרון כבר יומיים",
        "bad_sentence": "כואב לי את הגרון יומיים",
        "role": "רופא משפחה",
        "answer": "אני גם משתעל בלילה",
    },
    {
        "slug": "pharmacy",
        "title": "Pharmacy prescription",
        "level": "A2",
        "he_topic": "בבית מרקחת",
        "need": "לקנות תרופה עם מרשם",
        "word": "מרשם",
        "phrase": "The doctor gave me a prescription",
        "sentence": "הרופא נתן לי מרשם לתרופה הזאת",
        "bad_sentence": "הרופא נתן לי מרשם אל התרופה",
        "role": "רוקח",
        "answer": "איך צריך לקחת את התרופה?",
    },
    {
        "slug": "emergency_room",
        "title": "Emergency room",
        "level": "B1",
        "he_topic": "בחדר מיון",
        "need": "להסביר פציעה",
        "word": "צילום",
        "phrase": "I fell and hurt my leg",
        "sentence": "נפלתי במדרגות וכואבת לי הרגל",
        "bad_sentence": "נפלתי במדרגות וכואב לי הרגל",
        "role": "אחות במיון",
        "answer": "אני צריך לדעת איפה עושים צילום",
    },
    {
        "slug": "post_office",
        "title": "Post office",
        "level": "A1",
        "he_topic": "בדואר",
        "need": "לשלוח מכתב רשום",
        "word": "מעטפה",
        "phrase": "I want to send a package",
        "sentence": "אני רוצה לשלוח חבילה קטנה לחיפה",
        "bad_sentence": "אני רוצה לשלוח חבילה קטן",
        "role": "פקיד בדואר",
        "answer": "כמה עולה בול לחוץ לארץ?",
    },
    {
        "slug": "bank_account",
        "title": "Bank account",
        "level": "B1",
        "he_topic": "בבנק",
        "need": "לפתוח חשבון בנק",
        "word": "חשבון",
        "phrase": "I want to open a new account",
        "sentence": "אני רוצה לפתוח חשבון חדש ולקבל כרטיס",
        "bad_sentence": "אני רוצה לפתוח חשבון חדשה",
        "role": "פקיד בנק",
        "answer": "איזה מסמכים צריך להביא?",
    },
    {
        "slug": "atm_problem",
        "title": "ATM card problem",
        "level": "B1",
        "he_topic": "בעיה בכספומט",
        "need": "לדווח שהכרטיס נבלע",
        "word": "כספומט",
        "phrase": "The ATM swallowed my card",
        "sentence": "הכספומט נבלע לי את הכרטיס בבוקר",
        "bad_sentence": "הכספומט בלעתי לי הכרטיס",
        "role": "נציג בנק",
        "answer": "אני צריך לבטל את הכרטיס הישן",
    },
    {
        "slug": "municipality",
        "title": "Municipality form",
        "level": "B1",
        "he_topic": "בעירייה",
        "need": "למלא טופס בקשה",
        "word": "אישור",
        "phrase": "I need an official document",
        "sentence": "אני צריך אישור רשמי מהעירייה",
        "bad_sentence": "אני צריך אישור רשמית",
        "role": "פקידת עירייה",
        "answer": "הטופס הזה לא ברור לי",
    },
    {
        "slug": "national_insurance",
        "title": "National Insurance website",
        "level": "B2",
        "he_topic": "באתר של ביטוח לאומי",
        "need": "להבין הודעה באתר",
        "word": "קצבה",
        "phrase": "I received a message from National Insurance",
        "sentence": "קיבלתי הודעה שחסר מסמך בבקשה שלי",
        "bad_sentence": "קיבלתי הודעה שחסר מסמך בבקשה שלי הוא",
        "role": "נציג שירות",
        "answer": "אני לא בטוח איזה מסמך צריך להעלות",
    },
    {
        "slug": "internet_service",
        "title": "Internet customer service",
        "level": "B2",
        "he_topic": "שיחה עם נציג שירות אינטרנט",
        "need": "לדווח על תקלה באינטרנט",
        "word": "תקלה",
        "phrase": "The internet does not work since yesterday",
        "sentence": "האינטרנט לא עובד מאתמול בערב",
        "bad_sentence": "האינטרנט לא עובד מאתמול בערביות",
        "role": "נציג תמיכה",
        "answer": "כבר ניסיתי לכבות ולהדליק את הראוטר",
    },
    {
        "slug": "apartment_rent",
        "title": "Renting an apartment",
        "level": "A2",
        "he_topic": "השכרת דירה",
        "need": "לשאול על דירה להשכרה",
        "word": "שכירות",
        "phrase": "How much is the rent?",
        "sentence": "הדירה קרובה לאוניברסיטה ויש בה שני חדרים",
        "bad_sentence": "הדירה קרוב לאוניברסיטה ויש בו שני חדרים",
        "role": "בעל דירה",
        "answer": "אני רוצה לראות את הדירה ביום ראשון",
    },
    {
        "slug": "home_repair",
        "title": "Home repair",
        "level": "A2",
        "he_topic": "תיקון בבית",
        "need": "לדווח על נזילה",
        "word": "נזילה",
        "phrase": "There is water on the floor",
        "sentence": "יש נזילה במטבח והקיר רטוב",
        "bad_sentence": "יש נזילה במטבח והקיר רטובה",
        "role": "בעל בית",
        "answer": "מתי אפשר לשלוח טכנאי?",
    },
    {
        "slug": "hotel_checkin",
        "title": "Hotel check-in",
        "level": "A2",
        "he_topic": "במלון",
        "need": "לעשות צ'ק אין",
        "word": "הזמנה",
        "phrase": "I have a reservation for two nights",
        "sentence": "יש לי הזמנה לשני לילות על שם סאמר",
        "bad_sentence": "יש לי הזמנה לשתי לילות",
        "role": "פקיד קבלה",
        "answer": "אפשר לקבל חדר שקט?",
    },
    {
        "slug": "travel_plans",
        "title": "Travel planning",
        "level": "A2",
        "he_topic": "תכנון נסיעה",
        "need": "לתכנן נסיעה לבית לחם",
        "word": "נסיעה",
        "phrase": "We leave early in the morning",
        "sentence": "אנחנו נוסעים מוקדם בבוקר וחוזרים בערב",
        "bad_sentence": "אנחנו נוסעים מוקדם בבוקר וחוזרים בערבית",
        "role": "חבר שמארגן טיול",
        "answer": "צריך לבדוק מתי יוצא האוטובוס",
    },
    {
        "slug": "late_notice",
        "title": "Late notice",
        "level": "A2",
        "he_topic": "הודעה על איחור",
        "need": "להודיע שאני מאחר",
        "word": "מאחר",
        "phrase": "I will be ten minutes late",
        "sentence": "אני מאחר בעשר דקות בגלל הפקק",
        "bad_sentence": "אני מאחרת בעשר דקות בגלל הפקק",
        "role": "מזכירה שמחכה לי",
        "answer": "אפשר להזיז את התור לשעה אחרת?",
    },
    {
        "slug": "job_interview",
        "title": "Job interview",
        "level": "B1",
        "he_topic": "ראיון עבודה",
        "need": "להציג ניסיון בעבודה",
        "word": "ניסיון",
        "phrase": "I worked with customers for two years",
        "sentence": "עבדתי עם לקוחות במשך שנתיים",
        "bad_sentence": "עבדתי עם לקוחות במשך שנים שני",
        "role": "מראיין",
        "answer": "אני מחפש עבודה שמתאימה ללימודים שלי",
    },
    {
        "slug": "workplace_meeting",
        "title": "Workplace meeting",
        "level": "B1",
        "he_topic": "פגישה בעבודה",
        "need": "להסביר משימה חדשה",
        "word": "דוח",
        "phrase": "I will send the report by tomorrow",
        "sentence": "אשלח את הדוח עד מחר בצהריים",
        "bad_sentence": "אני אשלח את הדוח עד מחר בצהרייםים",
        "role": "מנהל צוות",
        "answer": "אני צריך עוד יום כדי לסיים את העבודה",
    },
    {
        "slug": "school_parent_meeting",
        "title": "Parent-teacher meeting",
        "level": "A2",
        "he_topic": "יום הורים בבית ספר",
        "need": "לדבר עם המורה",
        "word": "מחנכת",
        "phrase": "How is my son doing in class?",
        "sentence": "אני רוצה לדעת איך הבן שלי מתקדם בכיתה",
        "bad_sentence": "אני רוצה לדעת איך הבן שלי מתקדם בכיתהים",
        "role": "מורה",
        "answer": "הוא משתתף אבל צריך לתרגל קריאה",
    },
    {
        "slug": "kindergarten",
        "title": "Kindergarten update",
        "level": "A2",
        "he_topic": "בגן הילדים",
        "need": "לשאול על הילדה שלי בגן",
        "word": "גננת",
        "phrase": "Did she eat today?",
        "sentence": "הילדה שלי הייתה עייפה בבוקר",
        "bad_sentence": "הילדה שלי היה עייף בבוקר",
        "role": "גננת",
        "answer": "היא אכלה ושיחקה עם החברות",
    },
    {
        "slug": "library",
        "title": "Library study",
        "level": "A1",
        "he_topic": "בספרייה",
        "need": "לשאול איפה אפשר ללמוד",
        "word": "שקט",
        "phrase": "I need a quiet place",
        "sentence": "אני צריך מקום שקט כדי ללמוד",
        "bad_sentence": "אני צריך מקום שקט ללמודת",
        "role": "ספרנית",
        "answer": "איפה המדף של ספרי העברית?",
    },
    {
        "slug": "exam_prep",
        "title": "Exam preparation",
        "level": "B1",
        "he_topic": "הכנה למבחן",
        "need": "לבקש הסבר לפני מבחן",
        "word": "חזרה",
        "phrase": "I need to review the grammar",
        "sentence": "אני צריך לחזור על הפעלים לפני המבחן",
        "bad_sentence": "אני צריך לחזור על הפעלים לפני מבחנים",
        "role": "מורה פרטית",
        "answer": "הנושא הכי קשה לי הוא עבר ועתיד",
    },
    {
        "slug": "numbers_prices",
        "title": "Numbers and prices",
        "level": "A1",
        "he_topic": "מספרים ומחירים",
        "need": "לתרגל מחירים בחנות",
        "word": "עולה",
        "phrase": "It costs thirty shekels",
        "sentence": "הספר עולה שלושים שקלים",
        "bad_sentence": "הספר עולה שלושה שקליםים",
        "role": "מוכר",
        "answer": "יש לי רק חמישים שקל",
    },
    {
        "slug": "time_schedule",
        "title": "Time and schedule",
        "level": "A1",
        "he_topic": "שעות וזמנים",
        "need": "לשאול מתי מתחיל השיעור",
        "word": "בשעה",
        "phrase": "The lesson starts at eight",
        "sentence": "השיעור מתחיל בשעה שמונה וחצי",
        "bad_sentence": "השיעור מתחילה בשעה שמונה וחצי",
        "role": "חבר לכיתה",
        "answer": "אני מגיע עשר דקות לפני השיעור",
    },
    {
        "slug": "weather",
        "title": "Weather",
        "level": "A1",
        "he_topic": "מזג אוויר",
        "need": "לדבר על מזג האוויר",
        "word": "חם",
        "phrase": "It is cold today",
        "sentence": "היום קר אבל מחר יהיה חם",
        "bad_sentence": "היום קר אבל מחר יהיה חמה",
        "role": "חבר ברחוב",
        "answer": "אני צריך לקחת מעיל בערב",
    },
    {
        "slug": "phone_store",
        "title": "Phone store",
        "level": "A2",
        "he_topic": "בחנות טלפונים",
        "need": "לקנות מטען חדש",
        "word": "אחריות",
        "phrase": "My phone battery is weak",
        "sentence": "הסוללה של הטלפון נגמרת מהר",
        "bad_sentence": "הסוללה של הטלפון נגמר מהר",
        "role": "מוכר טלפונים",
        "answer": "יש אחריות על המטען הזה?",
    },
    {
        "slug": "lost_item",
        "title": "Lost item",
        "level": "A2",
        "he_topic": "חפץ שאבד",
        "need": "לדווח שאיבדתי תיק",
        "word": "אבד",
        "phrase": "I lost my bag on the bus",
        "sentence": "איבדתי את התיק שלי באוטובוס",
        "bad_sentence": "איבדתי התיק שלי באוטובוס",
        "role": "נציג אבידות",
        "answer": "בתיק היו ספר ומחשב קטן",
    },
    {
        "slug": "payment_problem",
        "title": "Payment problem",
        "level": "B1",
        "he_topic": "בעיה בתשלום",
        "need": "להסביר שחויבתי פעמיים",
        "word": "חיוב",
        "phrase": "I was charged twice",
        "sentence": "ראיתי חיוב כפול בכרטיס האשראי",
        "bad_sentence": "ראיתי חיוב כפולה בכרטיס האשראי",
        "role": "נציג שירות לקוחות",
        "answer": "אני רוצה לקבל החזר או הסבר",
    },
    {
        "slug": "upload_document",
        "title": "Uploading a document",
        "level": "B1",
        "he_topic": "העלאת מסמך באתר",
        "need": "להעלות קובץ לאתר",
        "word": "קובץ מצורף",
        "phrase": "The file did not upload",
        "sentence": "ניסיתי להעלות את הקובץ אבל קיבלתי שגיאה",
        "bad_sentence": "ניסיתי להעלות את הקובץ אבל קיבל שגיאה",
        "role": "תמיכה טכנית",
        "answer": "הקובץ הוא צילום של תעודת זהות",
    },
    {
        "slug": "birthday_party",
        "title": "Birthday party",
        "level": "A2",
        "he_topic": "מסיבת יום הולדת",
        "need": "להזמין חברים למסיבה",
        "word": "הזמנה",
        "phrase": "The party starts at seven",
        "sentence": "המסיבה מתחילה בשבע בערב בבית שלי",
        "bad_sentence": "המסיבה מתחיל בשבע בערב",
        "role": "חבר שמוזמן",
        "answer": "אני מביא עוגה ושתייה",
    },
    {
        "slug": "wedding_family",
        "title": "Family wedding",
        "level": "A2",
        "he_topic": "חתונה במשפחה",
        "need": "לדבר על חתונה",
        "word": "כלה",
        "phrase": "My cousin is getting married",
        "sentence": "בן הדוד שלי מתחתן בשבוע הבא",
        "bad_sentence": "בן הדוד שלי מתחתן בשבוע הבאה",
        "role": "קרוב משפחה",
        "answer": "החתונה תהיה באולם גדול",
    },
    {
        "slug": "culture_music",
        "title": "Music and culture",
        "level": "A2",
        "he_topic": "מוזיקה ותרבות",
        "need": "לדבר על שיר שאני אוהב",
        "word": "תזמורת",
        "phrase": "I like old songs",
        "sentence": "אני אוהב לשמוע שירים ישנים בערבית ובעברית",
        "bad_sentence": "אני אוהב לשמוע שירים ישנה",
        "role": "חבר שמדבר על מוזיקה",
        "answer": "המילים של השיר קשות לי",
    },
    {
        "slug": "sports_gym",
        "title": "Gym and exercise",
        "level": "A1",
        "he_topic": "ספורט וחדר כושר",
        "need": "להירשם לחדר כושר",
        "word": "מנוי",
        "phrase": "I exercise three times a week",
        "sentence": "אני מתאמן שלוש פעמים בשבוע",
        "bad_sentence": "אני מתאמן שלושה פעמים בשבוע",
        "role": "פקיד חדר כושר",
        "answer": "כמה עולה מנוי לחודש?",
    },
    {
        "slug": "teacher_feedback",
        "title": "Teacher feedback",
        "level": "B1",
        "he_topic": "משוב מהמורה",
        "need": "לבקש משוב על הדיבור שלי",
        "word": "הגייה",
        "phrase": "Please correct my pronunciation",
        "sentence": "אני רוצה לשפר את ההגייה שלי בעברית",
        "bad_sentence": "אני רוצה לשפר ההגייה שלי בעברית",
        "role": "מורה לעברית",
        "answer": "קשה לי להבדיל בין ח' לבין כ'",
    },
    {
        "slug": "small_talk_neighbor",
        "title": "Small talk with neighbor",
        "level": "A1",
        "he_topic": "שיחה עם שכן",
        "need": "לדבר עם שכן בבניין",
        "word": "שכן",
        "phrase": "Good morning, how are you?",
        "sentence": "בוקר טוב, מה שלומך היום?",
        "bad_sentence": "בוקר טוב, מה שלומך היוםים",
        "role": "שכן בבניין",
        "answer": "אני חדש בבניין הזה",
    },
    {
        "slug": "public_signs",
        "title": "Understanding public signs",
        "level": "A2",
        "he_topic": "שלטים במרחב ציבורי",
        "need": "להבין שלט בתחנה",
        "word": "אסור",
        "phrase": "Entry is forbidden",
        "sentence": "כתוב על השלט שאסור להיכנס",
        "bad_sentence": "כתוב על השלט שאסור להיכנסים",
        "role": "עובד תחנה",
        "answer": "אני לא מבין את המילה יציאה",
    },
    {
        "slug": "health_insurance",
        "title": "Health insurance",
        "level": "B1",
        "he_topic": "קופת חולים וביטוח בריאות",
        "need": "לשאול על זכאות לבדיקה",
        "word": "זכאות",
        "phrase": "Am I eligible for this test?",
        "sentence": "אני רוצה לבדוק אם יש לי זכאות לבדיקה הזאת",
        "bad_sentence": "אני רוצה לבדוק אם יש לי זכאות לבדיקה הזה",
        "role": "נציג קופת חולים",
        "answer": "הרופא אמר שאני צריך הפניה",
    },
    {
        "slug": "shopping_return",
        "title": "Returning a product",
        "level": "A2",
        "he_topic": "החזרת מוצר",
        "need": "להחזיר מוצר לחנות",
        "word": "קבלה",
        "phrase": "I want to return this product",
        "sentence": "אני רוצה להחזיר את המוצר כי הוא לא עובד",
        "bad_sentence": "אני רוצה להחזיר את המוצר כי היא לא עובד",
        "role": "נציג שירות בחנות",
        "answer": "יש לי קבלה מהקנייה",
    },
    {
        "slug": "public_complaint",
        "title": "Public service complaint",
        "level": "B2",
        "he_topic": "תלונה לשירות ציבורי",
        "need": "לנסח תלונה קצרה",
        "word": "ערעור",
        "phrase": "I want to appeal the fine",
        "sentence": "אני רוצה להגיש ערעור על הדוח שקיבלתי",
        "bad_sentence": "אני רוצה להגיש ערעור על הדוח שקיבלתי אותו",
        "role": "נציג שירות ציבורי",
        "answer": "לא הבנתי למה קיבלתי את הדוח",
    },
    {
        "slug": "news_simple",
        "title": "Simple news discussion",
        "level": "B1",
        "he_topic": "שיחה פשוטה על חדשות",
        "need": "להגיד שקראתי כתבה",
        "word": "כתבה",
        "phrase": "I read an article this morning",
        "sentence": "קראתי כתבה קצרה על תחבורה ציבורית",
        "bad_sentence": "קראתי כתבה קצר על תחבורה ציבורית",
        "role": "חבר לכיתה",
        "answer": "אני רוצה ללמוד איך מסכמים כתבה",
    },
    {
        "slug": "lesson_review",
        "title": "Lesson review",
        "level": "A1",
        "he_topic": "חזרה על שיעור",
        "need": "לסכם מילים חדשות",
        "word": "לחזור על",
        "phrase": "Can we review the words?",
        "sentence": "אני רוצה לחזור על המילים של השיעור",
        "bad_sentence": "אני רוצה לחזור את המילים של השיעור",
        "role": "מורה לעברית",
        "answer": "המילים החדשות היו בית, כיתה, ספר",
    },
]


def load_dotenv(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and (override or key not in os.environ):
            os.environ[key] = value


def build_messages(topic: dict) -> list[str]:
    return [
        f"בוא נתרגל שיחה על {topic['he_topic']}.",
        f"אני צריך {topic['need']}.",
        f"מה זה {topic['word']}?",
        f"תן לי משפט קצר עם המילה {topic['word']}.",
        topic["sentence"],
        f"תתקן לי את המשפט: {topic['bad_sentence']}",
        f"תן לי שאלה אחת על {topic['he_topic']}.",
        topic["answer"],
        f"תן לי דיאלוג קצר עם {topic['role']}.",
        "תסכם לי שלוש מילים חשובות מהשיחה.",
    ]


def post_json(url: str, payload: dict, headers: dict, timeout: float) -> tuple[int, dict | str]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            **headers,
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8")
            return response.status, json.loads(response_body) if response_body else {}
    except HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed_body: dict | str = json.loads(response_body)
        except json.JSONDecodeError:
            parsed_body = response_body
        return exc.code, parsed_body
    except (TimeoutError, URLError, OSError) as exc:
        return 0, {"error": type(exc).__name__, "detail": str(exc)}


def classify_response(status: int, response: dict | str) -> str:
    if status < 200 or status >= 300:
        return "http_or_network_error"
    if not isinstance(response, dict):
        return "non_json_response"
    if response.get("fallbackUsed"):
        return f"fallback:{response.get('fallbackReason') or 'UNKNOWN'}"
    if response.get("cacheHit"):
        return "cache"
    if response.get("routerHit"):
        return "local_router"
    if response.get("inputTokens") or response.get("outputTokens"):
        return "llm_provider"
    return "answered_unknown_route"


def is_quota_stop(status: int, response: dict | str) -> bool:
    if status == 429:
        return True
    if isinstance(response, dict):
        reason = str(response.get("fallbackReason") or response.get("error") or response.get("detail") or "")
        if "QUOTA" in reason.upper() or "RATE_LIMIT" in reason.upper() or "RESOURCE_EXHAUSTED" in reason.upper():
            return True
    elif "quota" in response.lower() or "rate limit" in response.lower():
        return True
    return False


def summarize(results: list[dict], started_at: str, completed_at: str, stopped_reason: str | None) -> dict:
    fallback_counts: dict[str, int] = {}
    route_counts: dict[str, int] = {}
    level_counts: dict[str, int] = {}
    topic_counts: dict[str, dict[str, int]] = {}
    latencies = []
    for result in results:
        route = result["diagnosis"]
        route_counts[route] = route_counts.get(route, 0) + 1
        level = result["topic"]["level"]
        level_counts[level] = level_counts.get(level, 0) + 1
        topic_slug = result["topic"]["slug"]
        topic_stats = topic_counts.setdefault(
            topic_slug,
            {"turns": 0, "fallbacks": 0, "errors": 0, "quotaStops": 0},
        )
        topic_stats["turns"] += 1
        response = result.get("response", {})
        if isinstance(response, dict) and response.get("fallbackUsed"):
            reason = response.get("fallbackReason") or "UNKNOWN"
            fallback_counts[reason] = fallback_counts.get(reason, 0) + 1
            topic_stats["fallbacks"] += 1
        if result["status"] < 200 or result["status"] >= 300:
            topic_stats["errors"] += 1
        if result.get("quotaStop"):
            topic_stats["quotaStops"] += 1
        if isinstance(result.get("wallLatencyMs"), (int, float)):
            latencies.append(result["wallLatencyMs"])

    completed_sessions = len({result["session"]["id"] for result in results if result["turn"] == 10})
    attempted_sessions = len({result["session"]["id"] for result in results})
    return {
        "startedAt": started_at,
        "completedAt": completed_at,
        "stoppedReason": stopped_reason,
        "targetSessions": 50,
        "targetTurnsPerSession": 10,
        "targetTurns": 500,
        "attemptedSessions": attempted_sessions,
        "completedSessions": completed_sessions,
        "completedTurns": len(results),
        "routeCounts": dict(sorted(route_counts.items())),
        "fallbackReasonCounts": dict(sorted(fallback_counts.items(), key=lambda item: item[1], reverse=True)),
        "levelCounts": dict(sorted(level_counts.items())),
        "topicBreakdown": topic_counts,
        "averageWallLatencyMs": round(sum(latencies) / len(latencies), 2) if latencies else None,
        "maxWallLatencyMs": round(max(latencies), 2) if latencies else None,
    }


def write_markdown(path: Path, summary: dict, sessions: list[dict]) -> None:
    lines = [
        "# Lisan 50 Session Conversation Audit",
        "",
        f"- Started: {summary['startedAt']}",
        f"- Completed: {summary['completedAt']}",
        f"- Target: {summary['targetSessions']} sessions x {summary['targetTurnsPerSession']} turns = {summary['targetTurns']} turns",
        f"- Completed: {summary['completedSessions']} full sessions, {summary['completedTurns']} turns",
        f"- Stopped reason: {summary['stoppedReason'] or 'completed'}",
        f"- Average wall latency: {summary['averageWallLatencyMs']} ms",
        "",
        "## Route Counts",
        "",
    ]
    for key, value in summary["routeCounts"].items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Fallback Reasons", ""])
    if summary["fallbackReasonCounts"]:
        for key, value in summary["fallbackReasonCounts"].items():
            lines.append(f"- `{key}`: {value}")
    else:
        lines.append("- None")

    for session in sessions:
        lines.extend(
            [
                "",
                f"## {session['index']}. {session['topic']['title']} (`{session['topic']['slug']}`)",
                "",
                f"- Session ID: `{session['id']}`",
                f"- Level: `{session['topic']['level']}`",
                "",
                "| # | Student message | Bot answer (HE) | Bot answer (AR) | Diagnosis | Latency |",
                "|---:|---|---|---|---|---:|",
            ]
        )
        for turn in session["turns"]:
            response = turn.get("response", {})
            answer_he = response.get("answerHe") if isinstance(response, dict) else str(response)
            answer_ar = response.get("answerAr") if isinstance(response, dict) else ""
            lines.append(
                "| {turn} | {message} | {answer_he} | {answer_ar} | `{diagnosis}` | {latency} |".format(
                    turn=turn["turn"],
                    message=escape_md(turn["message"]),
                    answer_he=escape_md(answer_he or ""),
                    answer_ar=escape_md(answer_ar or ""),
                    diagnosis=escape_md(turn["diagnosis"]),
                    latency=turn.get("wallLatencyMs", ""),
                )
            )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def escape_md(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", "<br>")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    load_dotenv(ROOT_DIR.parent / ".env")
    load_dotenv(ROOT_DIR / ".env", override=True)

    parser = argparse.ArgumentParser(
        description="Run 50 topic-specific chat sessions with 10 messages each against /api/ai/chat."
    )
    parser.add_argument("--base-url", default=os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--sessions", type=int, default=50)
    parser.add_argument("--turns", type=int, default=10)
    parser.add_argument("--timeout", type=float, default=45.0)
    parser.add_argument("--sleep", type=float, default=1.5)
    parser.add_argument("--stop-on-quota", action=argparse.BooleanOptionalAction, default=True)
    args = parser.parse_args()

    selected_topics = TOPICS[: args.sessions]
    if args.sessions > len(TOPICS):
        raise ValueError(f"Requested {args.sessions} sessions but only {len(TOPICS)} topics are defined.")

    base_url = args.base_url.rstrip("/")
    if base_url.endswith("/api/ai/chat"):
        url = base_url
    elif base_url.endswith("/api/ai"):
        url = f"{base_url}/chat"
    else:
        url = f"{base_url}/api/ai/chat"

    secret = os.getenv("AI_SERVICE_INTERNAL_SECRET", "").strip()
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    detail_path = REPORTS_DIR / f"conversation_50_sessions_{run_id}.jsonl"
    conversations_path = REPORTS_DIR / f"conversation_50_sessions_{run_id}.json"
    summary_path = REPORTS_DIR / f"conversation_50_sessions_{run_id}_summary.json"
    markdown_path = REPORTS_DIR / f"conversation_50_sessions_{run_id}.md"

    started_at = datetime.now(UTC).isoformat()
    sessions: list[dict] = []
    results: list[dict] = []
    stopped_reason: str | None = None
    consecutive_errors = 0

    with detail_path.open("w", encoding="utf-8") as detail_handle:
        for index, topic in enumerate(selected_topics, start=1):
            session_id = f"conv50-{run_id}-{index:02d}-{topic['slug']}"
            user_id = f"conv50-user-{index:02d}-{topic['slug']}"
            session = {
                "index": index,
                "id": session_id,
                "userId": user_id,
                "topic": topic,
                "turns": [],
            }
            sessions.append(session)
            messages = build_messages(topic)[: args.turns]
            print(f"SESSION {index:02d}/{len(selected_topics)} {topic['slug']} level={topic['level']}", flush=True)

            for turn_number, message in enumerate(messages, start=1):
                payload = {
                    "message": message,
                    "level": topic["level"],
                    "includeArabic": True,
                    "voiceMode": False,
                    "sessionId": session_id,
                    "userId": user_id,
                }
                headers = {"X-User-ID": user_id}
                if secret:
                    headers["X-Internal-Service-Secret"] = secret

                started_turn = time.perf_counter()
                status, response_body = post_json(url, payload, headers, args.timeout)
                wall_latency_ms = round((time.perf_counter() - started_turn) * 1000, 2)
                diagnosis = classify_response(status, response_body)
                quota_stop = is_quota_stop(status, response_body)
                turn = {
                    "runId": run_id,
                    "session": {"index": index, "id": session_id, "userId": user_id},
                    "topic": topic,
                    "turn": turn_number,
                    "message": message,
                    "request": {
                        "url": url,
                        "payload": payload,
                        "headers": {
                            "X-User-ID": user_id,
                            "X-Internal-Service-Secret": "<set>" if secret else "<unset>",
                        },
                    },
                    "status": status,
                    "ok": 200 <= status < 300 and isinstance(response_body, dict),
                    "wallLatencyMs": wall_latency_ms,
                    "diagnosis": diagnosis,
                    "quotaStop": quota_stop,
                    "response": response_body if isinstance(response_body, dict) else {"raw": response_body},
                }
                session["turns"].append(turn)
                results.append(turn)
                detail_handle.write(json.dumps(turn, ensure_ascii=False) + "\n")
                detail_handle.flush()

                answer = ""
                if isinstance(response_body, dict):
                    answer = response_body.get("answerHe") or response_body.get("detail") or response_body.get("error") or ""
                else:
                    answer = response_body
                print(
                    f"  [{index:02d}.{turn_number:02d}] status={status} {diagnosis} "
                    f"latency={wall_latency_ms}ms answer={answer!r}",
                    flush=True,
                )

                if status < 200 or status >= 300:
                    consecutive_errors += 1
                else:
                    consecutive_errors = 0

                if args.stop_on_quota and quota_stop:
                    stopped_reason = f"quota_or_rate_limit_at_session_{index:02d}_turn_{turn_number:02d}"
                    print(f"STOPPING: {stopped_reason}", flush=True)
                    break

                if consecutive_errors >= 3:
                    stopped_reason = f"three_consecutive_http_or_network_errors_at_session_{index:02d}_turn_{turn_number:02d}"
                    print(f"STOPPING: {stopped_reason}", flush=True)
                    break

                if args.sleep > 0:
                    time.sleep(args.sleep)

            if stopped_reason:
                break

    completed_at = datetime.now(UTC).isoformat()
    summary = summarize(results, started_at, completed_at, stopped_reason)
    conversations_doc = {
        "summary": summary,
        "sessions": sessions,
    }
    conversations_path.write_text(json.dumps(conversations_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(markdown_path, summary, sessions)

    latest_files = [
        (detail_path, REPORTS_DIR / "conversation_50_sessions_latest.jsonl"),
        (conversations_path, REPORTS_DIR / "conversation_50_sessions_latest.json"),
        (summary_path, REPORTS_DIR / "conversation_50_sessions_latest_summary.json"),
        (markdown_path, REPORTS_DIR / "conversation_50_sessions_latest.md"),
    ]
    for source, target in latest_files:
        shutil.copyfile(source, target)

    print(
        json.dumps(
            {
                "detailReport": str(detail_path),
                "conversationsReport": str(conversations_path),
                "summaryReport": str(summary_path),
                "markdownReport": str(markdown_path),
                **summary,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )
    return 0 if stopped_reason is None else 2


if __name__ == "__main__":
    sys.exit(main())
