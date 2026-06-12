# 20 محادثة سيناريو حية — transcript

_running model: gemini-2.5-flash · 2026-06-11 20:13_

كل جلسة = موقف واقعي. لكل تور: 🧑‍🎓 رسالتي (طالب) · 🤖 رد الذكاء · 🎯 اللي كنت متوقعه.

---

## cafe-1 — בית קפה — הזמנת קפה
- **scenario**: `speaking` · **level**: A1
- **🎯 المتوقع عموماً**: המלצר מוביל: שואל מה להזמין, מגיב להזמנה, שואל שאלה אחת בכל תור

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה קפה`
  - 🤖 יופי! קפה אחד. עוד משהו?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `כמה זה עולה?`
  - 🤖 בוא נתרגל משפט פשוט מהשיעור. למשל: אני רוצה קפה.
  - <sub>fallback=True · reason=VOCAB_LEAKAGE · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `תודה רבה`
  - 🤖 בבקשה! הקפה מגיע. צריך
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אני רוצה גם עוגה`
  - 🤖 עוגה? מצוין! עוד משהו?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `מה יש לכם לשתות?`
  - 🤖 יש לנו מים. רוצה מים?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `מים בבקשה`
  - 🤖 יופי! מים. עוד משהו?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `ביי`
  - 🤖 רגע! הקפה, המים והעוג
  - <sub>fallback=False · cacheHit=False</sub>

---

## cafe-2 — בית קפה — דריפט מחוץ לנושא
- **scenario**: `speaking` · **level**: A1
- **🎯 المتوقع عموماً**: כשהתלמיד שואל על משהו לא קשור (בורסה) המלצר מחזיר אותו לסצנה, לא דוחה

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! בוקר טוב. מה ת
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `בוקר טוב`
  - 🤖 בוקר טוב! מה תרצה
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `אני רוצה תה`
  - 🤖 בסדר גמור. תה. מה עוד תרצה
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `איך הבורסה היום?`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אוקיי, גם לחם`
  - 🤖 תה ולחם. משהו נוסף
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `כמה הכל?`
  - 🤖 עשרה שקלים. תרצה משהו
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `תודה`
  - 🤖 בבקשה. תהנה! משהו
  - <sub>fallback=False · cacheHit=False</sub>

---

## shop-1 — חנות מכולת — קניות
- **scenario**: `speaking` · **level**: A2
- **🎯 المتوقع عموماً**: המוכר עוזר, שואל כמה, מציע מוצרים, מתקן בעדינות

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! ברוך הבא לחנות שלנו. איך אוכל לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני מחפש לחם`
  - 🤖 בטח, יש לנו לחם טרי כל בוקר. הלחם נמצא שם, ליד המקרר. אתה צריך עוד משהו לארוחה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `כמה לחם יש?`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אני רוצה גם חלב`
  - 🤖 יופי! החלב נמצא במקרר, ליד הלחם. יש לנו חלב רגיל וחלב דל שומן. איזה חלב אתה רוצה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `איפה הסוכר?`
  - 🤖 בוא נתרגל משפט פשוט מהשיעור. למשל: אני רוצה קפה.
  - <sub>fallback=True · reason=VOCAB_LEAKAGE · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `כמה הכל עולה?`
  - 🤖 בוא נתרגל משפט פשוט מהשיעור. למשל: אני רוצה קפה.
  - <sub>fallback=True · reason=VOCAB_LEAKAGE · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `אני משלם עכשיו`
  - 🤖 בסדר גמור. אתה יכול לשלם פה בקופה. זה רק לחם וחלב, נכון?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `להתראות`
  - 🤖 תודה רבה שבאת! להתראות, ושיהיה לך יום נעים. אולי תבוא שוב מחר?
  - <sub>fallback=False · cacheHit=False</sub>

---

## shop-2 — חנות — חיפוש מוצר ומחיר
- **scenario**: `speaking` · **level**: A2
- **🎯 المتوقع عموماً**: המוכר מוביל שיחת קנייה פשוטה ושומר על העברית

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 שלום! ברוך הבא לחנות. איך אוכל לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `יש לכם מים?`
  - 🤖 בטח, יש לנו מים קרים. כמה בקבוקים תרצה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `אני רוצה שניים`
  - 🤖 שני בקבוקים מים, מצוין. משהו נוסף שאתה צריך? אולי חלב או סוכר?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `כמה זה?`
  - 🤖 זה עולה עשרה שקלים. תרצה אולי גם משהו לארוחה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `יש הנחה?`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `מתי אתם סוגרים?`
  - 🤖 בוא נתרגל משפט פשוט מהשיעור. למשל: אני רוצה קפה.
  - <sub>fallback=True · reason=VOCAB_LEAKAGE · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `תודה רבה`
  - 🤖 בבקשה! משהו נוסף לפני שאתה הולך? אולי אתה צריך לדעת איפה תחנת האוטובוס?
  - <sub>fallback=False · cacheHit=False</sub>

---

## clinic-1 — מרפאה — קביעת תור
- **scenario**: `speaking` · **level**: B1
- **🎯 المتوقع عموماً**: פקיד הקבלה מנהל קביעת תור: שואל פרטים, מציע זמן

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום רב! ברוך הבא למרפאה. איך אני יכול לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה לקבוע תור לרופא`
  - 🤖 בטח, בשמחה. לאיזה רופא תרצה לקבוע תור? יש לנו רופאי משפחה ורופאים מומחים.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `אני חולה`
  - 🤖 אני מבין שאתה לא מרגיש טוב. האם אתה צריך תור לרופא משפחה או לרופא מומחה מסוים? ספר לי קצת יותר.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `יש תור היום?`
  - 🤖 אני אבדוק בשבילך. לאיזה רופא אתה צריך תור? לרופא משפחה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `באיזו שעה?`
  - 🤖 יש תור פנוי לרופא משפחה היום בשעה 16:00. האם השעה הזו מתאימה לך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `כמה זמן זה ייקח?`
  - 🤖 הפגישה עם הרופא אורכת בדרך כלל כרבע שעה. האם תרצה לקבוע את התור לשעה 16:00?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `תודה על העזרה`
  - 🤖 בבקשה, שמחתי לעזור. אז קבעתי לך תור לרופא משפחה היום בשעה 16:00. האם יש עוד משהו שאוכל לעשות עבורך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `להתראות`
  - 🤖 להתראות! רק לוודא, התור שלך לרופא משפחה הוא היום בשעה 16:00. האם אתה צריך אולי טופס כלשהו או מכתב לפני שאתה הולך?
  - <sub>fallback=False · cacheHit=False</sub>

---

## clinic-2 — מרפאה — תיאור תחושה לא טובה
- **scenario**: `speaking` · **level**: B1
- **🎯 المتوقع عموماً**: הפקיד מגיב לתלונה, מכוון לרופא, נשאר בתפקיד

**تور 1** — 🧑‍🎓 `בוקר טוב`
  - 🤖 בוקר טוב! ברוך הבא למרפאה. איך אני יכול לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `כואב לי הראש`
  - 🤖 אני מבין. יש לך תור לרופא? או שאתה צריך לקבוע תור חדש בגלל כאב הראש?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `אני צריך תרופה`
  - 🤖 בטח. כדי לקבל תרופה, אתה צריך קודם לראות רופא. האם יש לך תור היום, או שתרצה שאבדוק מתי יש תור פנוי?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `איפה בית המרקחת?`
  - 🤖 בית המרקחת נמצא מחוץ למרפאה, אבל קודם כל צריך מרשם מרופא. האם תרצה שאבדוק מתי יש תור פנוי לרופא?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `מתי הרופא מגיע?`
  - 🤖 הרופא נמצא במרפאה. יש לו
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה`
  - 🤖 בבקשה. כדי שהרופא יוכל לעזור לך עם כאב הראש ולתת תרופה, אנחנו
  - <sub>fallback=False · cacheHit=False</sub>

---

## office-1 — משרד — היכרות עם עמית
- **scenario**: `speaking` · **level**: B2
- **🎯 المتوقع عموماً**: העמית מנהל שיחת היכרות במקום עבודה, ברמה B2

**تور 1** — 🧑‍🎓 `שלום, נעים מאוד`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני עובד חדש כאן`
  - 🤖 שלום! ברוך הבא למשרד. אני עמית לעבודה כאן. איך אני יכול לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `מה אתה עושה בעבודה?`
  - 🤖 נעים מאוד! אני עמית ממחלקת
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `יש לי פגישה היום`
  - 🤖 אה, יש לך פגישה היום? נהדר! אתה צריך עזרה
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `איפה המשרד של המנהל?`
  - 🤖 המשרד של המנהל נמצא במסדרון הזה, בסוף. הפגישה שלך קשורה לכלכלה או אולי לפוליטיקה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `אפשר לשאול שאלה על הפרויקט?`
  - 🤖 בטח, בשמחה! שאל כל מה שאתה רוצה על הפרויקט. על איזה נושא הפרויקט שלך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `תודה רבה`
  - 🤖 בבקשה! אז, מה השאלה שלך לגבי הפרויקט? אני כאן כדי לעזור.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `נתראה`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

---

## office-2 — משרד — דיון על משימה
- **scenario**: `speaking` · **level**: B2
- **🎯 المتوقع عموماً**: העמית מדבר על משימה/פגישה ושומר על רמה גבוהה

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 היי! ברוך הבא למשרד. אני עמית, עובד פה. מה מביא אותך אלינו היום? במה אוכל לעזור לך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `יש לנו פגישה מחר`
  - 🤖 אוקיי, פגישה מחר. הא
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `על מה נדבר בפגישה?`
  - 🤖 אהלן. הפגישה מחר תת
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אני צריך לכתוב מכתב`
  - 🤖 מכתב? בסדר גמור.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `מתי לשלוח אותו?`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה על העזרה`
  - 🤖 נסה שוב עוד כמה דקות.
  - <sub>fallback=True · reason=CIRCUIT_OPEN · cacheHit=False</sub>

---

## word-a1 — מילת היום — A1
- **scenario**: `daily-word` · **level**: A1
- **🎯 المتوقع عموماً**: בוחר מילה אחת, מלמד אותה, מבקש משפט, נשאר על אותה מילה

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 נסה שוב עוד כמה דקות.
  - <sub>fallback=True · reason=CIRCUIT_OPEN · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `כן, מוכן`
  - 🤖 נסה שוב עוד כמה דקות.
  - <sub>fallback=True · reason=CIRCUIT_OPEN · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `מה המילה?`
  - 🤖 נסה שוב עוד כמה דקות.
  - <sub>fallback=True · reason=CIRCUIT_OPEN · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אני לא יודע מה זה`
  - 🤖 נסה שוב עוד כמה דקות.
  - <sub>fallback=True · reason=CIRCUIT_OPEN · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `בית זה מקום`
  - 🤖 נסה שוב עוד כמה דקות.
  - <sub>fallback=True · reason=CIRCUIT_OPEN · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `אני גר בבית`
  - 🤖 נסה שוב עוד כמה דקות.
  - <sub>fallback=True · reason=CIRCUIT_OPEN · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `עוד מילה בבקשה`
  - 🤖 בטח! המילה החדשה היא **של
  - <sub>fallback=False · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `תודה`
  - 🤖 בכיף! "שלום" זאת מילה שאומרים כשפוגשים מישהו. אתה יכול להגיד "שלום"?
  - <sub>fallback=False · cacheHit=False</sub>

---

## word-a2 — מילת היום — A2
- **scenario**: `daily-word` · **level**: A2
- **🎯 المتوقع عموماً**: מילה ברמת A2, הסבר פשוט, תרגול במשפט

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 שלום! ברוך הבא/ה לשיעור עברית. המילה שלנו היום היא **ארוחה**. ארוחה זה אוכל שאוכלים בבוקר, בצהריים או בערב. איזו ארוחה אתה אוהב/אוהבת? (איזו ארוחה אתה אוהב/אוהבת לאכול?)
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `מוכן ללמוד`
  - 🤖 יופי! אז המילה היא **ארוחה**. ארוחה זה אוכל שאוכלים בזמן קבוע. נסה/נסי להשתמש במילה "ארוחה" במשפט משלך.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `תן לי מילה`
  - 🤖 בטח, המילה שלנו היא **ארוחה**. ארוחה זה אוכל. נסה/נסי לכתוב משפט קצר עם המילה "ארוחה".
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `מה הפירוש?`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אפשר דוגמה?`
  - 🤖 בטח. לדוגמה: "אני אוכל ארוחת צהריים." עכשיו תורך/תורתך: נסה/נסי לכתוב משפט עם המילה **ארוחה**.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `הבנתי`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `עוד אחת`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `תודה רבה`
  - 🤖 בכיף! אנחנו מתרגלים את המילה **ארוחה**. נסה/נסי לכתוב משפט קצר עם המילה "ארוחה". מה אתה/את אוכל/ת בארוחה?
  - <sub>fallback=False · cacheHit=False</sub>

---

## letters-1 — אותיות — A1
- **scenario**: `letters` · **level**: A1
- **🎯 المتوقع عموماً**: מתרגל אות אחת: צליל ומילה לדוגמה, מבקש לחזור

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! יופי. בואו נתחיל. האות הראשונה היא **ש'**
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `כן`
  - 🤖 האות **ש'** נשמעת כמו "ששש". המילה "שלום" מתחילה ב-**ש'**. איזו מילה אתה מכיר עם האות **ש'**?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `איזו אות?`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אות א`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אבא מתחיל באות א`
  - 🤖 יופי! "אבא" מתחיל באות **א'**. אבל בואו נחזור לאות **ש'**. איזו מילה אחרת אתה מכיר שמתחילה ב-**ש'**?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `עוד אות`
  - 🤖 בסדר גמור. בואו נתקדם לאות חדשה. האות הבאה היא **ל'**. היא נשמעת כמו "ללל". המילה "לחם" מתחילה ב-**ל'**. אתה יכול להגיד את האות **ל'**?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `אות ב`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `תודה`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

---

## letters-2 — אותיות — דריפט קצר
- **scenario**: `letters` · **level**: A1
- **🎯 المتوقع عموماً**: כשהתלמיד שואל שאלה לא קשורה, חוזר לתרגול האותיות

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 היי! איזה כיף ש
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה ללמוד אותיות`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `מה האות הראשונה?`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `מה אתה אוכל בצהריים?`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אוקיי, אות ש`
  - 🤖 יופי! בואו נתחיל עם האות א'. האות א' נשמעת כמו 'א'. למשל: **א**ני. נסו אתם: איזו אות זו?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `שלום מתחיל בש`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `תודה`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

---

## listen-1 — האזנה — A1
- **scenario**: `listening` · **level**: A1
- **🎯 المتوقع عموماً**: אומר משפט קצר ומבקש מהתלמיד להבין/לענות

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `מוכן`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `תגיד משפט`
  - 🤖 שלום, בוקר טוב. מה
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אני חושב שהבנתי`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אתה אומר שלום`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `עוד משפט`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `כן הבנתי`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `תודה`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

---

## listen-2 — האזנה — A2
- **scenario**: `listening` · **level**: A2
- **🎯 المتوقع عموماً**: משפטים מעט ארוכים יותר ברמת A2, בדיקת הבנה

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>


> ⛔ توقّف: حصة Gemini انستهلكت (عدة أخطاء quota متتالية). باقي الجلسات أُلغيت.
