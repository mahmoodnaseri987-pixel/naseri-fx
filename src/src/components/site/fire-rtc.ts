/* لینک مستقیم WebRTC DataChannel برای «میدان آتش» گروهی.
   چرا؟ رلهٔ ابیلی مسیر WebSocket/TLS/TCP است؛ روی خطوط شلوغ و پرگم، «سرُری TCP»
   همهٔ بسته‌ها را پشت‌سرهم می‌بندد و نتیجه برای مهمان «تند‌و‌کند شدن، پرش و
   گاهی انجماد» است. DataChannel روی SCTP/UDP مستقیم (DTLS) کار می‌کند؛ با
   ordered:false و maxRetransmits:0 بستهٔ گم‌شده هرگز جلوی بستهٔ بعدی را
   نمی‌گیرد — همان رفتار UDP که بازی‌های رقابتی می‌خواهند.
   ابیلی فقط «سیگنالینگ» (تبادل SDP/ICE) و لابی/رستور را برعهده دارد و در
   صورت باز نشدن P2P، مسیر رلهٔ قبلی بی‌صدا به‌کار خودش ادامه می‌دهد.

   نقش‌ها: مهمان همیشه offer می‌سازد (از لابی، پیش از شروع مسابقه) و میزبان
   پاسخ می‌دهد — بنابراین هرگز «glare» رخ نمی‌دهد. STUN گوگل/کلودفلر +
   TURN باز عمومی برای گذر از NAT متقارن اپراتورها. */
export type RtcSignal =
  | { k: "offer"; sdp: string }
  | { k: "answer"; sdp: string }
  | { k: "ice"; cs: RTCIceCandidateInit[] };

/** شکل پیام سیگنالینگ روی کانال اتاق ابیلی (رویداد "rtc") */
export type RtcWire = { t: "rtc"; k: string; from: string; to: string; sdp?: string; cs?: RTCIceCandidateInit[] };

export interface RtcLinkOpts {
  initiator: boolean;
  onSignal: (s: RtcSignal) => void;
  onMessage: (data: string) => void;
  onOpen: () => void;
  onDown: () => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

/** یک پیوند P2P با یک همتا — یک کانال «st» نامطمئن (UDP-مانند) برای ورودی/اسنپ‌شات. */
export class RtcLink {
  readonly pc: RTCPeerConnection;
  open = false;
  closedByUs = false;
  private dc: RTCDataChannel | null = null;
  private opts: RtcLinkOpts;
  private downSent = false;
  private remoteSet = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private iceBuf: RTCIceCandidateInit[] = [];
  private iceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RtcLinkOpts) {
    this.opts = opts;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 2 });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.queueIce(e.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if ((s === "failed" || s === "closed") && !this.closedByUs) this.fireDown();
    };
    if (opts.initiator) {
      /* کانال نامطمئن — گم‌شده‌ها بازپخش نمی‌شوند تا سرُری رخ ندهد */
      this.wire(this.pc.createDataChannel("st", { ordered: false, maxRetransmits: 0 }));
    } else {
      this.pc.ondatachannel = (e) => this.wire(e.channel);
    }
  }

  private wire(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => {
      this.open = true;
      this.opts.onOpen();
    };
    dc.onclose = () => {
      this.open = false;
      if (!this.closedByUs) this.fireDown();
    };
    dc.onerror = () => {
      /* onclose پیگیری می‌کند */
    };
    dc.onmessage = (e) => {
      if (typeof e.data === "string") this.opts.onMessage(e.data);
    };
  }

  private fireDown() {
    if (this.downSent) return;
    this.downSent = true;
    this.opts.onDown();
  }

  private queueIce(c: RTCIceCandidateInit) {
    this.iceBuf.push(c);
    if (this.iceTimer === null) {
      /* کاندیدها دسته‌ای می‌روند — برای زیر سقف نرخ کانال ابیلی در لحظهٔ اتصال */
      this.iceTimer = setTimeout(() => {
        this.iceTimer = null;
        if (this.iceBuf.length === 0 || this.closedByUs) return;
        const cs = this.iceBuf;
        this.iceBuf = [];
        this.opts.onSignal({ k: "ice", cs });
      }, 120);
    }
  }

  async offer(): Promise<void> {
    const o = await this.pc.createOffer();
    await this.pc.setLocalDescription(o);
    if (this.pc.localDescription) this.opts.onSignal({ k: "offer", sdp: this.pc.localDescription.sdp });
  }

  async acceptOffer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    this.markRemoteSet();
    const a = await this.pc.createAnswer();
    await this.pc.setLocalDescription(a);
    if (this.pc.localDescription) this.opts.onSignal({ k: "answer", sdp: this.pc.localDescription.sdp });
  }

  async acceptAnswer(sdp: string): Promise<void> {
    if (this.pc.signalingState !== "have-local-offer") return;
    await this.pc.setRemoteDescription({ type: "answer", sdp });
    this.markRemoteSet();
  }

  private markRemoteSet() {
    if (this.remoteSet) return;
    this.remoteSet = true;
    const p = this.pendingIce;
    this.pendingIce = [];
    this.addIce(p);
  }

  addIce(cs: RTCIceCandidateInit[]): void {
    for (const c of cs) {
      if (!c || typeof c.candidate !== "string" || c.candidate.length === 0) continue;
      if (!this.remoteSet) {
        /* کاندید پیش از SDP دور رسید — تا پس از setRemoteDescription نگه داشته می‌شود */
        this.pendingIce.push(c);
        continue;
      }
      void this.pc.addIceCandidate(c).catch(() => {
        /* کاندید ناهماهنگ با نسخهٔ فعلی — نادیده */
      });
    }
  }

  /** ارسال روی کانال نامطمئن؛ false = ارسال نشد (فریم قربانی می‌شود، تازه‌ترین می‌ماند) */
  send(str: string): boolean {
    const dc = this.dc;
    if (!this.open || !dc || dc.readyState !== "open") return false;
    if (dc.bufferedAmount > 131072) return false; /* همتا عقب افتاده — از عقب‌افتاده‌ها نمی‌سازیم */
    try {
      dc.send(str);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.closedByUs = true;
    this.open = false;
    if (this.iceTimer !== null) {
      clearTimeout(this.iceTimer);
      this.iceTimer = null;
    }
    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }
}
