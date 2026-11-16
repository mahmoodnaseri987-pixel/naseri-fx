/* ثبت متادیتای تأییدشدهٔ آهنگ‌های نوستالژی «شعر یادت نره» — در زمان build ورکسل.
   محیط build پروداکشن خودش DATABASE_URL دارد؛ این اسکریپت با @prisma/client
   مستقیم (بدون override فایل .env) رکوردها را upsert و فعال می‌کند.
   مصرع‌ها از منابع متن ترانه (چند منبع مؤید) + هم‌سنجی با رونویسی ASR کلیپ‌ها.
   «این دل» ویگن: مصرع قابل‌تأیید پیدا نشد → پیش‌نویس (غیرفعال) می‌ماند.
   idempotent است — در هر build دوباره اجرا می‌شود و بی‌ضرر است.
   خطا deploy را نمی‌شکند (log و exit 0) — متادیتا جنبهٔ محتوایی دارد. */

import { PrismaClient } from "@prisma/client";

const SONGS = [
  {
    filename: "Haydeh - Dele Divooneh (Remixbaz.com) (320).mp3",
    title: "دل دیوونه",
    artist: "هایده",
    answerLine: "ندونستی زمونه نامهربونه ای دل",
    contextLines: ["دل دیوونه ای دل", "ای بی‌نشونه ای دل"],
    extraLines: ["وقتی شکستی از عشق عاشق شدی دوباره", "ندونستی محبت خریداری نداره"],
  },
  {
    filename: "Habib - Bezan Baran (Remixbaz.com) (320).mp3",
    title: "بزن باران",
    artist: "حبیب",
    answerLine: "بزن باران که به چشمان یاران",
    contextLines: ["بزن باران بهاران فصل خون است", "بزن باران که صحرا لاله‌گون است"],
    extraLines: ["جهان تاریک و دریا واژگون است", "بزن باران که دین را دام کردند", "بزن باران خدا بازیچه‌ای شد"],
  },
  {
    filename: "Dariush - Be Man Nago Doset Daram (Remixbaz.com) (320).mp3",
    title: "به من نگو دوستت دارم",
    artist: "داریوش",
    answerLine: "به من نگو دوستت دارم که باورم نمی‌شه",
    contextLines: ["حالا که کار تو شده پر از نیرنگ و ریا", "حالا که دل تو شده فرسنگ‌ها دور از خدا"],
    extraLines: ["نگو فقط تو رو دارم که باورم نمی‌شه", "حالا که کار تو شده پر از نیرنگ و ریا"],
  },
  {
    filename: "Ebi - Jabeh Javaher (Remixbaz.com) (320).mp3",
    title: "جعبهٔ جواهر",
    artist: "ابی",
    answerLine: "حیف که زد و شکستش هر که به دستش افتاد",
    contextLines: ["دلم مثل یه جعبه‌ست جعبهٔ پر جواهر", "خونه به رنگ یاقوت اما خوشه به ظاهر"],
    extraLines: ["دلم مثل یه باغه باغ بهار نارنج", "دلم مثل یه جعبه‌ست جعبهٔ پر جواهر"],
  },
  {
    filename: "Lelya Forohar - Joni Jonom (Remixbaz.com) (320).mp3",
    title: "جونی جونم",
    artist: "لیلا فروهر",
    answerLine: "شب مهتاب سی تو آواز می‌خونم",
    contextLines: ["جونی جونم بیا دردت به جونم"],
    extraLines: ["جونی جونم یار جونم", "جونی جونم بیا دردت به جونم"],
  },
  {
    filename: "Mansour - Daricheh (Remixbaz.com) (320).mp3",
    title: "دریچه",
    artist: "منصور",
    answerLine: "یک دریچه برای پرواز",
    contextLines: ["یک دریچه برای رفتن", "یک دریچه برای دیدن"],
    extraLines: ["یک دریچه به سوی خورشید"],
  },
  {
    filename: "Moein - Roya (Remixbaz.com) (320).mp3",
    title: "رویا",
    artist: "معین",
    answerLine: "که من و تو رو بشونه واسه گفتن خوبی",
    contextLines: ["من از این دنیا چی می‌خوام", "دو تا صندلی چوبی"],
    extraLines: ["من از این دنیا چی می‌خوام یه وجب زمین خالی", "همون‌قدر که یک اطاقک بشه خونهٔ خیالی"],
  },
  {
    filename: "Omid - Dobare Mahshar Mikonam (Remixbaz.com) (320).mp3",
    title: "دوباره محشر می‌کنم",
    artist: "امید",
    answerLine: "دوباره محشر می‌کنم زندگی از سر می‌کنم",
    contextLines: ["بمونی خونه دلم عزیزه خونه تو باشی"],
    extraLines: ["به آسمون عاشقی پرواز دیگر می‌کنم", "نوید پیک عشقو نگفته باور می‌کنم"],
  },
  {
    filename: "Shahram Shabpareh - Hamseda (Remixbaz.com) (320).mp3",
    title: "هم‌صدا",
    artist: "شهرام شب‌پره",
    answerLine: "واسه ترانه‌های عاشقونه",
    contextLines: ["رفیق باوفا بودیم من و تو", "یه عمری هم‌صدا بودیم من و تو"],
    extraLines: ["صدایی آشنا بودیم من و تو", "کبوتر دلم بی‌پر و باله"],
  },
  {
    filename: "Vigen - In Del (Remixbaz.com) (320).mp3",
    title: "این دل",
    artist: "ویگن",
    answerLine: "", // مصرع قابل‌تأیید نبود — پیش‌نویس می‌ماند
    contextLines: [],
    extraLines: [],
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.log("[sher-seed] DATABASE_URL پروداکشن در دسترس نیست — رد شد.");
    return;
  }
  const db = new PrismaClient();
  try {
    let active = 0;
    for (const s of SONGS) {
      const isActive = Boolean(s.answerLine.trim());
      const data = {
        title: s.title,
        artist: s.artist,
        clipStart: 0, // فایل همان کلیپ ۳۰ثانیه‌ای است — پخش از ثانیهٔ صفر
        answerLine: s.answerLine.trim(),
        contextLines: JSON.stringify(s.contextLines),
        extraLines: JSON.stringify(s.extraLines),
        active: isActive,
        category: "nostalgia",
      };
      const song = await db.sherSong.upsert({
        where: { filename: s.filename },
        update: data,
        create: { filename: s.filename, ...data },
      });
      if (song.active) active++;
      console.log(`[sher-seed] ${isActive ? "فعال" : "پیش‌نویس"} — ${s.title} (${s.artist})`);
    }
    const total = await db.sherSong.count({ where: { active: true } });
    console.log(`[sher-seed] ${active} ردیف این دسته فعال شد — کل فعال‌ها: ${total}`);
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

main().catch((e) => {
  console.log("[sher-seed] خطا (deploy ادامه می‌یابد):", e instanceof Error ? e.message : e);
}).finally(() => process.exit(0));
