/* بازی نمونه تک‌فایلی «حدس واژه» — یک صفحه HTML مستقل با تم تیره سایت.
   نکته: داخل این رشته از بک‌تیک و ${} استفاده نشده تا به‌عنوان template literal امن باشد. */

export const DEMO_GAME_SLUG = "vazhe-bazi";

export const DEMO_GAME_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>حدس واژه — بازی واژه‌ها</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { height:100%; }
  body {
    font-family: Vazirmatn, Tahoma, "Segoe UI", sans-serif;
    background:#09090b; color:#f4f4f5;
    display:flex; flex-direction:column; align-items:center;
    min-height:100%; padding:16px 12px 28px; user-select:none;
  }
  .wrap { width:100%; max-width:560px; display:flex; flex-direction:column; gap:14px; }
  .top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px; }
  .brand .dot { width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center;
    background:rgba(16,185,129,.12); border:1px solid rgba(16,185,129,.35); font-size:17px; }
  .chips { display:flex; gap:6px; }
  .chip { border:1px solid #27272a; background:#111113; border-radius:999px; padding:6px 12px; font-size:12px; font-weight:700; color:#a1a1aa; }
  .chip b { color:#34d399; }
  .card { background:rgba(24,24,27,.65); border:1px solid #27272a; border-radius:20px; padding:22px 16px; text-align:center; }
  .hint { font-size:14px; color:#a1a1aa; margin-bottom:6px; }
  .hint b { color:#e4e4e7; }
  .lives { display:flex; justify-content:center; gap:5px; margin:10px 0 16px; }
  .life { font-size:18px; transition:all .25s; }
  .life.off { opacity:.18; filter:grayscale(1); transform:scale(.85); }
  .word { display:flex; flex-wrap:wrap; justify-content:center; gap:7px; direction:rtl; min-height:46px; }
  .slot { width:38px; height:46px; border-radius:10px; border:2px solid #3f3f46; background:#101012;
    display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:800; color:#34d399;
    transition:all .2s; }
  .slot.hit { border-color:rgba(52,211,153,.65); background:rgba(16,185,129,.1); animation:pop .25s ease; }
  @keyframes pop { 50% { transform:scale(1.18); } }
  .msg { margin-top:14px; font-size:14px; font-weight:700; min-height:22px; color:#a1a1aa; }
  .msg.win { color:#34d399; }
  .msg.lose { color:#fb7185; }
  .kb { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
  .key { width:44px; height:44px; border-radius:12px; border:1px solid #3f3f46; background:#18181b;
    color:#e4e4e7; font-family:inherit; font-size:17px; font-weight:700; cursor:pointer; transition:all .15s; }
  .key:hover:not(:disabled) { border-color:rgba(52,211,153,.5); color:#34d399; }
  .key:disabled { cursor:default; opacity:.85; }
  .key.hit { background:rgba(16,185,129,.16); border-color:rgba(52,211,153,.6); color:#34d399; }
  .key.miss { background:rgba(244,63,94,.08); border-color:rgba(244,63,94,.25); color:#fb7185; opacity:.45; }
  .btn { border:none; border-radius:999px; background:#10b981; color:#09090b; font-family:inherit;
    font-size:14px; font-weight:800; padding:12px 26px; cursor:pointer; transition:background .2s; }
  .btn:hover { background:#34d399; }
  .btn.ghost { background:transparent; color:#a1a1aa; border:1px solid #3f3f46; }
  .btn.ghost:hover { color:#e4e4e7; border-color:#71717a; }
  .row { display:flex; justify-content:center; gap:8px; }
  .foot { text-align:center; font-size:11px; color:#52525b; margin-top:2px; }
  @media (max-width:430px){ .slot{width:30px;height:40px;font-size:18px} .key{width:38px;height:38px;font-size:15px} }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand"><span class="dot">🎮</span><span>حدس واژه</span></div>
    <div class="chips">
      <span class="chip">امتیاز <b id="score">۰</b></span>
      <span class="chip">رکورد <b id="best">۰</b></span>
    </div>
  </div>

  <div class="card">
    <p class="hint">راهنما: <b id="hint">…</b></p>
    <div class="lives" id="lives"></div>
    <div class="word" id="word"></div>
    <p class="msg" id="msg">حروف را حدس بزن!</p>
  </div>

  <div class="kb" id="kb"></div>

  <div class="row">
    <button class="btn" id="nextBtn" style="display:none">واژه بعدی</button>
    <button class="btn ghost" id="giveBtn">واژه جدید</button>
  </div>
  <p class="foot">فقط اعضای کافه سرگرمی — موفق باشی!</p>
</div>

<script>
(function(){
  var WORDS = [
    { w:"اپلیکیشن", h:"چیزی که روی گوشی نصب می‌کنید" },
    { w:"موبایل", h:"گوشی همراه" },
    { w:"بازی", h:"سرگرمی و تفریح" },
    { w:"کیبورد", h:"وسیله تایپ حروف" },
    { w:"اینترنت", h:"شبکه جهانی وب" },
    { w:"برنامه", h:"دستوراتی که رایانه اجرا می‌کند" },
    { w:"دیتابیس", h:"جای ذخیره اطلاعات" },
    { w:"طراحی", h:"هنر خلق ظاهر یک محصول" },
    { w:"ایده", h:"فکر نو و تازه" },
    { w:"پروژه", h:"کاری که تحویل داده می‌شود" },
    { w:"کدنویسی", h:"کار اصلی یک برنامه‌ساز" },
    { w:"تکنولوژی", h:"همان فناوری" },
    { w:"استور", h:"فروشگاه دانلود اپ‌ها" },
    { w:"فونت", h:"شکل و پیکره حروف" },
    { w:"سرور", h:"رایانه‌ای که همیشه روشن است" },
    { w:"امنیت", h:"محافظت از اطلاعات" },
    { w:"کاربر", h:"کسی که از برنامه استفاده می‌کند" },
    { w:"حافظه", h:"جای نگهداری موقت اطلاعات" },
    { w:"لپتاپ", h:"رایانه قابل حمل" },
    { w:"چاپگر", h:"دستگاه چاپ روی کاغذ" },
    { w:"مانیتور", h:"صفحه‌نمایش رایانه" },
    { w:"هاردیسک", h:"جای ذخیره فایل‌ها در رایانه" },
    { w:"وایفای", h:"اینترنت بی‌سیم" },
    { w:"باتری", h:"منبع انرژی گوشی" },
    { w:"شارژر", h:"وسیله پرکردن باتری" },
    { w:"هدفون", h:"وسیله گوش دادن به موسیقی" },
    { w:"دوربین", h:"وسیله عکاسی" },
    { w:"ماهواره", h:"شیئی که در مدار زمین می‌چرخد" },
    { w:"ربات", h:"ماشین مکانیکی شبیه انسان" },
    { w:"الگوریتم", h:"دستور مرحله‌به‌مرحله حل مسئله" },
    { w:"ویندوز", h:"سیستم‌عامل معروف مایکروسافت" },
    { w:"لینوکس", h:"سیستم‌عامل آزاد و متن‌باز" },
    { w:"وبسایت", h:"مجموعه صفحات اینترنتی" },
    { w:"ایمیل", h:"پست الکترونیکی" },
    { w:"دیجیتال", h:"عددی و رایانه‌ای" },
    { w:"آپدیت", h:"به‌روزرسانی نرم‌افزار" },
    { w:"دانلود", h:"گرفتن فایل از اینترنت" },
    { w:"آپلود", h:"فرستادن فایل به اینترنت" },
    { w:"گوگل", h:"موتور جستجوی مشهور" },
    { w:"پایتون", h:"زبان برنامه‌نویسی محبوب" },
    { w:"شیر", h:"سلطان جنگل" },
    { w:"پلنگ", h:"گربه‌سان خالدار و سریع" },
    { w:"آهو", h:"حیوان تیزپای دشت" },
    { w:"خرگوش", h:"حیوانی با گوش‌های بلند" },
    { w:"فیل", h:"بزرگ‌ترین حیوان خشکی" },
    { w:"زرافه", h:"بلندترین حیوان جهان" },
    { w:"کانگورو", h:"حیوانی با کیف، نماد استرالیا" },
    { w:"دلفین", h:"پستاندار باهوش دریا" },
    { w:"نهنگ", h:"بزرگ‌ترین جانور جهان" },
    { w:"عقاب", h:"پرنده شکاری سلطنتی" },
    { w:"جغد", h:"پرنده شب‌گرد نماد دانایی" },
    { w:"طوطی", h:"پرنده سخنور رنگارنگ" },
    { w:"گنجشک", h:"پرنده کوچک آشنا" },
    { w:"کلاغ", h:"پرنده سیاه باهوش" },
    { w:"خروس", h:"سحرخیز با بانگ صبح" },
    { w:"اردک", h:"پرنده آبزی معروف کارتونی" },
    { w:"قورباغه", h:"دوزیست جهنده" },
    { w:"تمساح", h:"خزنده درنده رودها" },
    { w:"عنکبوت", h:"بافنده تار" },
    { w:"پروانه", h:"حشره بال‌رنگارنگ" },
    { w:"زنبور", h:"سازنده عسل" },
    { w:"مورچه", h:"حشره سخت‌کوش زیر خاک" },
    { w:"سنجاب", h:"جمع‌کننده گردو روی درخت" },
    { w:"روباه", h:"حیوان مکار داستان‌ها" },
    { w:"خرس", h:"جانور قدرتمند عاشق عسل" },
    { w:"پنگوئن", h:"پرنده شناگر قطب جنوب" },
    { w:"گورخر", h:"اسب راه‌راه آفریقا" },
    { w:"شترمرغ", h:"پرنده دونده و بی‌پرواز" },
    { w:"کوهستان", h:"جای قله‌ها و برف" },
    { w:"جنگل", h:"سرزمین درخت‌ها" },
    { w:"آبشار", h:"سقوط آب از بلندی" },
    { w:"باران", h:"قطره‌های آسمانی" },
    { w:"برف", h:"پوشش سفید زمستان" },
    { w:"طوفان", h:"باد شدید و ویرانگر" },
    { w:"صحرا", h:"زمین پهناور خشک" },
    { w:"آتشفشان", h:"کوهی که گدازه می‌ریزد" },
    { w:"زلزله", h:"لرزش زمین" },
    { w:"ستاره", h:"چراغ درخشان آسمان شب" },
    { w:"کهکشان", h:"خانواده میلیاردی ستاره‌ها" },
    { w:"سیاره", h:"مانند زمین و مریخ" },
    { w:"خورشید", h:"ستاره نورانی روز" },
    { w:"اقیانوس", h:"پهنه بی‌کران آب" },
    { w:"درخت", h:"تنه، شاخه و برگ" },
    { w:"مهتاب", h:"نور ماه در شب" },
    { w:"آسمان", h:"گنبد آبی بالای سر" },
    { w:"نان", h:"پایه سفره ایرانی" },
    { w:"پنیر", h:"همراه همیشگی نان" },
    { w:"هندوانه", h:"میوه قرمز تابستان" },
    { w:"انار", h:"میوه دانه‌دانه نماد یلدا" },
    { w:"انگور", h:"خوشه‌ای و شیرین" },
    { w:"قهوه", h:"نوشیدنی تلخ بیدارباش" },
    { w:"شیرینی", h:"هدیه جشن‌ها" },
    { w:"بستنی", h:"خوراکی سرد و خوشمزه" },
    { w:"پیتزا", h:"نان گرد با پنیر ایتالیایی" },
    { w:"ساندویچ", h:"خوراکی بین دو تکه نان" },
    { w:"کباب", h:"غذای ملی ایرانی روی آتش" },
    { w:"برنج", h:"دانه سفید پایه پلو" },
    { w:"ماست", h:"لبنیات ترش و غلیظ" },
    { w:"عسل", h:"شیرینی کار زنبور" },
    { w:"گردو", h:"مغز داخل پوست چوبی" },
    { w:"پسته", h:"طلای سبک ایران" },
    { w:"زعفران", h:"طلای سرخ و گران‌ترین ادویه" },
    { w:"لیمو", h:"ترش و زرد" },
    { w:"هویج", h:"سبزی نارنجی ریشه‌ای" },
    { w:"گوجه", h:"قرمز سالاد" },
    { w:"خیار", h:"سبز و ترد" },
    { w:"ماکارونی", h:"رشته‌ای ایتالیایی" },
    { w:"سالاد", h:"مخلوط سبزیجات" },
    { w:"شربت", h:"نوشیدنی شیرین یخ‌دار" },
    { w:"شکلات", h:"شیرینی کاکائویی" },
    { w:"آشپزی", h:"هنر آماده‌کردن غذا" },
    { w:"خربزه", h:"میوه خوش‌بوی تابستانی" },
    { w:"پزشک", h:"درمانگر بیماران" },
    { w:"پرستار", h:"یار بیمار در بیمارستان" },
    { w:"معلم", h:"آموزگار کلاس" },
    { w:"مهندس", h:"سازنده طرح‌ها" },
    { w:"خلبان", h:"هدایت‌کننده هواپیما" },
    { w:"نقاش", h:"هنرمند بوم و رنگ" },
    { w:"خیاط", h:"دوختنده لباس" },
    { w:"نجار", h:"سازنده مبلمان چوبی" },
    { w:"آهنگر", h:"کار با آتش و آهن" },
    { w:"نانوا", h:"پخت‌کننده نان" },
    { w:"دندانپزشک", h:"درمانگر دهان و دندان" },
    { w:"خواننده", h:"صاحب صدای خوش" },
    { w:"بازیگر", h:"ایفاگر نقش" },
    { w:"کشاورز", h:"روستایی مزرعه‌دار" },
    { w:"ماهیگیر", h:"صیاد رود و دریا" },
    { w:"چوپان", h:"نگهبان گله" },
    { w:"برقکار", h:"کار با سیم و جریان" },
    { w:"فضانورد", h:"مسافر فضا" },
    { w:"روستا", h:"آبادی کوچک خارج شهر" },
    { w:"خیابان", h:"مسیر پهن شهر" },
    { w:"میدان", h:"چهارراه بزرگ شهر" },
    { w:"پارک", h:"فضای سبز شهر" },
    { w:"موزه", h:"خانه آثار تاریخی" },
    { w:"کتابخانه", h:"محل نگهداری کتاب‌ها" },
    { w:"دانشگاه", h:"خانه دانشجویان" },
    { w:"مدرسه", h:"جای درس‌خواندن" },
    { w:"بیمارستان", h:"محل درمان بیماران" },
    { w:"داروخانه", h:"محل خرید دارو" },
    { w:"فرودگاه", h:"جای پرواز هواپیماها" },
    { w:"ایستگاه", h:"محل توقف قطار" },
    { w:"هتل", h:"اقامتگاه مسافران" },
    { w:"رستوران", h:"محل صرف غذا" },
    { w:"بازار", h:"محل خرید و فروش" },
    { w:"کارخانه", h:"محل تولید محصولات" },
    { w:"پل", h:"راه روی رود" },
    { w:"تونل", h:"راه زیر کوه" },
    { w:"فوتبال", h:"بازی محبوب با توپ و دروازه" },
    { w:"والیبال", h:"بازی با توپ و تور بلند" },
    { w:"بسکتبال", h:"بازی سبد و توپ" },
    { w:"تنیس", h:"بازی با راکت و توپ سبز" },
    { w:"شنا", h:"ورزش در آب" },
    { w:"دوچرخه", h:"وسیله رکاب‌زنی" },
    { w:"کشتی", h:"ورزش پهلوانی روی تشک" },
    { w:"شطرنج", h:"بازی پادشاهان" },
    { w:"کاراته", h:"هنر رزمی ژاپنی" },
    { w:"تکواندو", h:"رشته رزمی کره‌ای" },
    { w:"بوکس", h:"مشت‌زنی" },
    { w:"اسکیت", h:"کفش چرخ‌دار" },
    { w:"اسکی", h:"سرخوردن روی برف" },
    { w:"ژیمناستیک", h:"ورزش حرکات نمایشی" },
    { w:"گلف", h:"ورزش با چوب و توپ روی چمن" },
    { w:"سنتور", h:"ساز چکشی با سیم‌های زیاد" },
    { w:"پیانو", h:"ساز کلیددار بزرگ" },
    { w:"گیتار", h:"ساز محبوب زهی" },
    { w:"ویولن", h:"ساز کمانی کوچک" },
    { w:"نقاشی", h:"هنر رنگ و بوم" },
    { w:"مجسمه", h:"هنر شکل‌دادن سنگ" },
    { w:"شعر", h:"ادب آهنگین" },
    { w:"داستان", h:"روایت وقایع" },
    { w:"رمان", h:"داستان بلند" },
    { w:"سینما", h:"خانه فیلم" },
    { w:"تئاتر", h:"صحنه نمایش زنده" },
    { w:"عکاسی", h:"هنر ثبت لحظه" },
    { w:"خوشنویسی", h:"هنر قلم و خط" },
    { w:"موسیقی", h:"هنر نغمه‌ها" },
    { w:"آهنگ", h:"ترانه با موسیقی" },
    { w:"رقص", h:"حرکات آهنگین بدن" },
    { w:"چتر", h:"سپر باران" },
    { w:"کیف", h:"جای گذاشتن وسایل" },
    { w:"عینک", h:"وسیله بهتر دیدن" },
    { w:"ساعت", h:"نشان‌دهنده زمان" },
    { w:"قیچی", h:"وسیله بریدن کاغذ" },
    { w:"سوزن", h:"ابزار دوخت" },
    { w:"دفتر", h:"برگ‌های درس" },
    { w:"مداد", h:"ابزار نوشتن" },
    { w:"کتاب", h:"بهترین دوست درس‌خوانده‌ها" },
    { w:"مجله", h:"نشریه تصویری" },
    { w:"روزنامه", h:"خبر هر روز صبح" },
    { w:"تمبر", h:"مهر پستی روی نامه" },
    { w:"کلید", h:"بازکننده قفل" },
    { w:"آینه", h:"نشان‌دهنده چهره" },
    { w:"حوله", h:"خشک‌کننده بدن" },
    { w:"صابون", h:"پاک‌کننده دست‌ها" },
    { w:"مسواک", h:"وسیله بهداشت دندان" },
    { w:"کفش", h:"پوشش پا" },
    { w:"دکمه", h:"بستن لباس" },
    { w:"زیپ", h:"وسیله بستن جیب و کیف" },
    { w:"قلب", h:"پمپ خون بدن" },
    { w:"مغز", h:"مرکز فرمان بدن" },
    { w:"استخوان", h:"چارچوب بدن" },
    { w:"ماهیچه", h:"موتور حرکت بدن" },
    { w:"خون", h:"مایع سرخ حیات" },
    { w:"تنفس", h:"دم و بازدم" },
    { w:"ویتامین", h:"تقویت‌کننده بدن" },
    { w:"دارو", h:"درمان بیماری" },
    { w:"واکسن", h:"پیشگیری از بیماری" },
    { w:"دندان", h:"سفیدهای دهان" },
    { w:"انگشت", h:"پنج‌تای هر دست" },
    { w:"خواب", h:"استراحت شبانه" },
    { w:"آزمایشگاه", h:"خانه آزمایش‌های علمی" },
    { w:"میکروسکوپ", h:"بزرگ‌نمایی موجودات ریز" },
    { w:"تلسکوپ", h:"دیدن ستاره‌ها" },
    { w:"نجوم", h:"دانش ستاره‌ها" },
    { w:"شیمی", h:"دانش مواد" },
    { w:"فیزیک", h:"دانش انرژی و حرکت" },
    { w:"ریاضی", h:"دانش اعداد" },
    { w:"هندسه", h:"دانش شکل‌ها" },
    { w:"اتم", h:"ریزترین جزء ماده" },
    { w:"انرژی", h:"توان انجام کار" },
    { w:"گرانش", h:"نیروی جاذبه زمین" }
  ];
  var LETTERS = ["ا","ب","پ","ت","ث","ج","چ","ح","خ","د","ذ","ر","ز","ژ","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ک","گ","ل","م","ن","و","ه","ی"];
  var MAX_LIVES = 6;

  var word = "", hint = "", guessed = {}, lives = MAX_LIVES, score = 0, best = 0, over = false;
  var elWord = document.getElementById("word");
  var elHint = document.getElementById("hint");
  var elMsg = document.getElementById("msg");
  var elLives = document.getElementById("lives");
  var elKb = document.getElementById("kb");
  var elScore = document.getElementById("score");
  var elBest = document.getElementById("best");
  var elNext = document.getElementById("nextBtn");
  var elGive = document.getElementById("giveBtn");

  function faNum(n){ var m=["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"]; var s=String(n), o=""; for(var i=0;i<s.length;i++){ o += (s[i]>="0"&&s[i]<="9") ? m[+s[i]] : s[i]; } return o; }

  function loadBest(){ try { best = parseInt(localStorage.getItem("vazheBaziBest")||"0",10)||0; } catch(e){ best = 0; } elBest.textContent = faNum(best); }
  function saveBest(){ try { localStorage.setItem("vazheBaziBest", String(best)); } catch(e){} }

  var bag = [];
  function shuffleArr(a){
    for (var k=a.length-1;k>0;k--){ var j=Math.floor(Math.random()*(k+1)); var t=a[k]; a[k]=a[j]; a[j]=t; }
  }
  function pickWord(){
    /* سبد تصادفی: هیچ واژه‌ای تا دیدن همه واژه‌ها تکرار نمی‌شود */
    if (!bag.length){ for (var k=0;k<WORDS.length;k++) bag.push(k); shuffleArr(bag); }
    var i = bag.pop();
    word = WORDS[i].w; hint = WORDS[i].h;
  }

  function buildKb(){
    elKb.innerHTML = "";
    for (var i=0;i<LETTERS.length;i++){
      var b = document.createElement("button");
      b.className = "key"; b.type = "button"; b.textContent = LETTERS[i];
      b.addEventListener("click", onKey);
      elKb.appendChild(b);
    }
  }

  function renderLives(){
    elLives.innerHTML = "";
    for (var i=0;i<MAX_LIVES;i++){
      var s = document.createElement("span");
      s.className = "life" + (i < MAX_LIVES - lives ? " off" : "");
      s.textContent = "❤";
      elLives.appendChild(s);
    }
  }

  function renderWord(){
    elWord.innerHTML = "";
    for (var i=0;i<word.length;i++){
      var ch = word[i];
      var d = document.createElement("div");
      d.className = "slot";
      if (guessed[ch]) { d.textContent = ch; if(!over) d.classList.add("hit"); }
      else if (over && lives===0) { d.textContent = ch; d.style.color = "#fb7185"; }
      elWord.appendChild(d);
    }
  }

  function setStatus(text, cls){
    elMsg.textContent = text;
    elMsg.className = "msg" + (cls ? " " + cls : "");
  }

  function onKey(ev){
    if (over) return;
    var ch = ev.currentTarget.textContent;
    var btns = elKb.getElementsByClassName("key");
    var btn = null;
    for (var i=0;i<btns.length;i++){ if (btns[i].textContent===ch && !btns[i].disabled){ btn = btns[i]; break; } }
    if (!btn) return;
    btn.disabled = true;

    if (word.indexOf(ch) !== -1){
      btn.classList.add("hit");
      guessed[ch] = true;
      renderWord();
      if (allDone()) win();
    } else {
      btn.classList.add("miss");
      lives--;
      renderLives();
      if (lives <= 0) lose();
    }
  }

  function allDone(){
    for (var i=0;i<word.length;i++){ if (!guessed[word[i]]) return false; }
    return true;
  }

  function win(){
    over = true;
    score += 10;
    if (score > best){ best = score; saveBest(); elBest.textContent = faNum(best); }
    elScore.textContent = faNum(score);
    setStatus("آفرین! +۱۰ امتیاز 🎉", "win");
    elNext.style.display = "";
  }

  function lose(){
    over = true;
    renderWord();
    setStatus("باختی! واژه «" + word + "» بود", "lose");
    score = 0;
    elScore.textContent = faNum(0);
  }

  function reset(newWord){
    guessed = {}; lives = MAX_LIVES; over = false;
    if (newWord) pickWord();
    elHint.textContent = hint;
    elNext.style.display = "none";
    buildKb(); renderLives(); renderWord();
    setStatus("حروف را حدس بزن!", "");
  }

  elNext.addEventListener("click", function(){ reset(true); });
  elGive.addEventListener("click", function(){ reset(true); });

  loadBest();
  reset(true);
})();
</script>
</body>
</html>`;
