# 20 محادثة سيناريو حية — batch 2 (مواقف مختلفة تماماً)

_running · 2026-06-12 14:13_

كل جلسة موقف جديد. لكل تور: 🧑‍🎓 رسالتي · 🤖 رد الذكاء.

---

## cafe-cold — בית קפה — קפה קר, מבקש להחליף
- **scenario**: `speaking` · **level**: A1
- **🎯 المتوقع**: מתקן טעות, מטפל בתלונה, נשאר מלצר

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! מה תרצה לשתות?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `הקפה שלי קר`
  - 🤖 אני מצטער. קפה חם?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `אני רוצה קפה חם`
  - 🤖 בסדר גמור. קפה חם אחד. עוד משהו?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אני שותה הרבה`
  - 🤖 יופי. עוד קפה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `כמה זה עולה?`
  - 🤖 זה עולה עשרים שקל. תודה!
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה`
  - 🤖 בבקשה. לילה טוב!
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `ביי`
  - 🤖 ביי ביי.
  - <sub>fallback=False · cacheHit=False</sub>

---

## cafe-two — בית קפה — הזמנה לשניים
- **scenario**: `speaking` · **level**: A1
- **🎯 المتوقع**: מנהל הזמנה לשניים, שואל שאלה אחת בכל תור

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! ברוך הבא. מה תרצה לשתות?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אנחנו שניים`
  - 🤖 אה, שניים! מצוין. מה תרצו לשתות?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `אני רוצה תה והוא רוצה קפה`
  - 🤖 בסדר גמור. תה אחד וקפה אחד. עוד משהו?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `יש עוגה?`
  - 🤖 כן, יש לנו עוגה טעימה. רוצים עוגה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `כמה הכל?`
  - 🤖 הכל עולה עשרים שקל. תודה רבה!
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `אנחנו משלמים`
  - 🤖 בבקשה. תודה ויום טוב!
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `להתראות`
  - 🤖 להתראות!
  - <sub>fallback=False · cacheHit=False</sub>

---

## shop-return — חנות — החזרת מוצר
- **scenario**: `speaking` · **level**: A2
- **🎯 المتوقع**: מטפל בהחזרה, שואל פרטים, נשאר מוכר

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! ברוך הבא. מה אתה צריך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה להחזיר חלב`
  - 🤖 חלב? למה אתה רוצה להחזיר את החלב? הוא לא טוב?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `החלב לא טוב`
  - 🤖 אה, אני מצטער לשמוע. בבקשה, תביא לי את החלב. אני אבדוק אותו.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `קניתי אתמול`
  - 🤖 בסדר גמור. זה בסדר. אני אחליף לך את החלב. האם אתה רוצה משהו אחר?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אני רוצה כסף בחזרה`
  - 🤖 נסה שוב עם שאלה קצרה.
  - <sub>fallback=True · reason=MODEL_ERROR · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה רבה`
  - 🤖 בבקשה. האם אתה צריך משהו נוסף היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `להתראות`
  - 🤖 להתראות! יום טוב לך.
  - <sub>fallback=False · cacheHit=False</sub>

---

## shop-card — חנות — תשלום בכרטיס
- **scenario**: `speaking` · **level**: A2
- **🎯 المتوقع**: שואל כמות, נותן מחיר במספרים, מקבל תשלום

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 שלום! ברוך הבא לחנות. במה אוכל לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה לחם וחלב`
  - 🤖 בטח. לחם טרי וחלב טרי. זה הכל?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `כמה הכל עולה?`
  - 🤖 הלחם עולה חמישה שקלים והחלב עולה שלושה שקלים. סך הכל שמונה שקלים.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אפשר לשלם בכרטיס?`
  - 🤖 כן, אפשר לשלם בכרטיס. בבקשה.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `איפה הכרטיס`
  - 🤖 בבקשה, תכניס את הכרטיס למכונה.
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה`
  - 🤖 בבקשה! האם תרצה משהו נוסף?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `ביי`
  - 🤖 ביי! יום טוב!
  - <sub>fallback=False · cacheHit=False</sub>

---

## clinic-cancel — מרפאה — ביטול תור
- **scenario**: `speaking` · **level**: B1
- **🎯 المتوقع**: מטפל בביטול, מציע תור חלופי, נשאר פקיד

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! ברוך הבא למרפאה. איך אני יכול לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה לבטל את התור שלי`
  - 🤖 בסדר גמור. לאיזה דוקטור או תאריך התור שלך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `התור היה היום בארבע`
  - 🤖 אני מצטער לשמוע. האם אתה רוצה לקבוע תור חדש?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אפשר תור מחר?`
  - 🤖 כן, בוודאי. יש לי פגישה פנויה מחר בשעה עשר בבוקר. מתאים לך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `באיזו שעה יש מקום?`
  - 🤖 יש לי מקום פנוי מחר בשעה עשר בבוקר. האם זה מתאים לך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה על העזרה`
  - 🤖 בבקשה. התור שלך נקבע למחר בשעה עשר. האם תרצה משהו נוסף?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `להתראות`
  - 🤖 להתראות. תרגיש טוב!
  - <sub>fallback=False · cacheHit=False</sub>

---

## clinic-results — מרפאה — תוצאות בדיקה
- **scenario**: `speaking` · **level**: B1
- **🎯 المتوقع**: מסביר תהליך, מכוון לרופא, נשאר בתפקיד

**تور 1** — 🧑‍🎓 `בוקר טוב`
  - 🤖 בוקר אור! ברוך הבא למרפאה. במה אוכל לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה את תוצאות הבדיקה`
  - 🤖 בטח. האם יש לך תור לדוקטור היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `עשיתי בדיקת דם`
  - 🤖 אה, הבנתי. האם קיבלת כבר את התוצאות?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `מתי הן מוכנות?`
  - 🤖 בדרך כלל, התוצאות מוכנות אחרי יומיים. האם את/ה רוצה לחכות כאן?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `צריך לדבר עם הרופא?`
  - 🤖 כן, הרופא צריך לראות את התוצאות. האם יש לך פגישה עם הרופא בקרוב?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה רבה`
  - 🤖 בבקשה. האם תרצה לקבוע פגישה עם הרופא עכשיו?
  - <sub>fallback=False · cacheHit=False</sub>

---

## office-vacation — משרד — בקשת חופשה
- **scenario**: `speaking` · **level**: B2
- **🎯 المتوقع**: עמית מנהל שיחה על חופשה ברמה גבוהה

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! ברוך הבא. מה אני יכולה לעזור לך היום? האם חיפשת משהו מסוים?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה לבקש חופשה`
  - 🤖 אה, חופשה! זה נשמע נהדר. אני מקווה שתהיה לך חופשה נעימה. לאיזה תאריכים תרצה לקחת את החופשה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `שבוע בחודש הבא`
  - 🤖 בסדר גמור. האם יש לך תאריכים ספציפיים בשבוע הבא שאתה מעדיף?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `למי אני צריך לפנות?`
  - 🤖 אתה צריך לפנות למחלקת משאבי אנוש. הם יטפלו בבקשת החופשה שלך. האם אתה יודע איפה נמצא המשרד שלהם?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `צריך למלא טופס?`
  - 🤖 כן, בדרך כלל צריך למלא טופס בקשה לחופשה. האם תרצה שאעזור לך למצוא את הטופס?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה על המידע`
  - 🤖 בבקשה. אם תצטרך משהו נוסף, אל תהסס לשאול. האם תרצה שאסביר לך עוד משהו לגבי החופשה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `נתראה`
  - 🤖 בטח, נתראה! האם תרצה שאשלח לך את הטופס במייל?
  - <sub>fallback=False · cacheHit=False</sub>

---

## office-deadline — משרד — בעיה בלוח זמנים
- **scenario**: `speaking` · **level**: B2
- **🎯 المتوقع**: דיון על דדליין/בעיה, שומר על רמה

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 שלום! ברוך הבא. במה אוכל לעזור לך היום?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `יש לי בעיה עם הפרויקט`
  - 🤖 אני מצטער לשמוע. ספר לי קצת יותר על הבעיה. מה קרה בפרויקט?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `אני לא אספיק עד מחר`
  - 🤖 זה נשמע מלחיץ. האם אתה צריך עזרה עם משהו ספציפי בפרויקט?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `אפשר עוד יומיים?`
  - 🤖 אני מבין. אני צריך לבדוק את זה עם המנהל. האם תרצה שאדבר איתו עכשיו?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `מה אני אומר למנהל?`
  - 🤖 אתה יכול להגיד לו שאתה זקוק לעוד זמן לסיום הפרויקט. האם תרצה שאסביר לו את הסיבה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `תודה רבה`
  - 🤖 בבקשה. אני אדבר איתו ואעדכן אותך. האם יש משהו נוסף שאוכל לעזור בו?
  - <sub>fallback=False · cacheHit=False</sub>

---

## word-mistake-a1 — מילת היום — תלמיד טועה
- **scenario**: `daily-word` · **level**: A1
- **🎯 المتوقع**: מלמד מילה; כשהתלמיד כותב משפט שגוי (היא גר) מתקן בעדינות

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! זה אומר "היי". מה שלומך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `מוכן`
  - 🤖 מצוין! "מוכן" זה טוב. האם אתה מוכן ללמוד מילה חדשה?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `מה המילה?`
  - 🤖 המילה היא "תודה". זה אומר "תודה".
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `היא גר`
  - 🤖 "היא גר" לא קשור למילה "תודה". האם אתה רוצה לומר "תודה"?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אני גר בתל אביב`
  - 🤖 יפה מאוד! "אני גר בתל אביב" זה משפט טוב. אבל אנחנו לומדים את המילה "תודה". האם אתה יכול להגיד "תודה"?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `עוד מילה`
  - 🤖 המילה היא "תודה". זה אומר "תודה". האם אתה יכול להגיד "תודה"?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `תודה`
  - 🤖 כל הכבוד! אתה אומר "תודה" מצוין. עכשיו, מילה חדשה: "בוקר". זה בוקר.
  - <sub>fallback=False · cacheHit=False</sub>

---

## word-b1 — מילת היום — B1
- **scenario**: `daily-word` · **level**: B1
- **🎯 المتوقع**: מילה ברמת B1 (שירות/עבודה), הסבר ותרגול

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! היום נלמד מילה חדשה. המילה הראשונה שלנו היא "בריאות". בריאות זה כשאדם מרגיש טוב בגוף ובנפש. איך נשתמש במילה "בריאות" במשפט?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני מוכן ללמוד`
  - 🤖 נהדר! המילה שלנו היא "בריאות". בריאות זה מצב טוב של הגוף והנפש. האם תוכל לומר לי משפט עם המילה "בריאות"?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `תן לי מילה`
  - 🤖 המילה שלנו להיום היא "בריאות". בריאות זה כשאדם מרגיש טוב. מה דעתך על משפט עם המילה "בריאות"?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `מה הפירוש?`
  - 🤖 המילה "בריאות" פירושה מצב טוב של הגוף והנפש. האם תוכל לנסות לכתוב משפט עם המילה "בריאות"?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `אפשר דוגמה?`
  - 🤖 בטח. למשל: "הספורט חשוב לבריאות". עכשיו תורך, נסה לכתוב משפט עם המילה "בריאות".
  - <sub>fallback=False · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `כתבתי משפט: אני הלך לעבודה`
  - 🤖 יפה שניסית! המשפט שלך לא קשור למילה "בריאות". נסה שוב, מה דעתך על משפט שקשור לבריאות?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `תודה`
  - 🤖 בבקשה. נחזור למילה שלנו, "בריאות". האם אתה יכול לכתוב משפט על חשיבות הבריאות?
  - <sub>fallback=False · cacheHit=False</sub>

---

## letters-mistake — אותיות — תלמיד טועה + דריפט
- **scenario**: `letters` · **level**: A1
- **🎯 المتوقع**: מתקן זיהוי שגוי של אות, מחזיר לתרגול عند الانحراف

**تور 1** — 🧑‍🎓 `שלום`
  - 🤖 שלום! אני מורה שלך לעברית. האות הראשונה היא ש. הצליל הוא "ש". המילה הראשונה היא "שלום". מה שלומך?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `אני רוצה ללמוד אות`
  - 🤖 נהדר! אנחנו לומדים אותיות. האות הראשונה היא ש. האם אתה יכול לומר ש?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 3** — 🧑‍🎓 `מה האות?`
  - 🤖 האות היא ש. היא נשמעת כמו "ש". האם אתה יכול לומר ש?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 4** — 🧑‍🎓 `האות ב נשמעת ששש`
  - 🤖 יפה מאוד! האות הזו היא ש. היא נשמעת "ש". המילה היא שלום. האם אתה יכול לומר ש?
  - <sub>fallback=False · cacheHit=False</sub>

**تور 5** — 🧑‍🎓 `כמה השעה?`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 6** — 🧑‍🎓 `אוקיי האות מ`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 7** — 🧑‍🎓 `מים מתחיל במ`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 8** — 🧑‍🎓 `תודה`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

---

## letters-a2 — אותיות — A2
- **scenario**: `letters` · **level**: A2
- **🎯 المتوقع**: אות אחת בכל פעם, מילת דוגמה, מבקש לחזור

**تور 1** — 🧑‍🎓 `היי`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>

**تور 2** — 🧑‍🎓 `מוכן`
  - 🤖 יש עומס עכשיו. נסה שוב עוד מעט.
  - <sub>fallback=True · reason=PROVIDER_QUOTA · cacheHit=False</sub>


> ⛔ توقّف: حصة Gemini مستهلكة. باقي الجلسات أُلغيت.
