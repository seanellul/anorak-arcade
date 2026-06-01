// ============================================================
//  Radio — a cast of recurring NPCs who hail the pod over the
//  course of a run. Each character has an ordered set of lines
//  (a small arc) that advances when its trigger event recurs:
//    control    → every new biome discovered
//    rival      → every new depth record
//    prospector → every relic recovered
//    buyer      → every earnings milestone crossed
//  Messages queue so two transmissions never stomp each other.
// ============================================================

export const RADIO_CAST = {
  control: {
    name: "MISSION CONTROL", color: "#7fd0ff",
    lines: [
      "Pod's away. Surface is tracking you, prospector. Try not to die in the first hundred metres.",
      "Clean descent. The geologists are thrilled with your readings — and I'm thrilled you're still breathing.",
      "Heads up: the deep strata were never fully surveyed. Translation — nobody knows what's down there. Mind yourself.",
      "Off the record? The last few pods we sent this deep never radioed back. You're the first. Keep going.",
      "I'm not cleared to say this, but — whatever's at the bottom, command already knows. They just won't tell us what.",
      "You're past every chart we have, prospector. From here on, you're the map. Good luck down there.",
    ],
  },
  rival: {
    name: "CUTTER VANE", color: "#ff7b5a",
    lines: [
      "So you're the shiny new drill they sent down. Cute. I've worked this rock since before you had a licence.",
      "A couple hundred metres and you think you're somebody? I eat that for breakfast, rookie.",
      "Huh. You're actually keeping pace. That's... mildly annoying.",
      "Alright, you're good. But the deep veins are MINE. Stay out of my rock.",
      "...how are you still going down? Nobody digs this deep. Nobody sane.",
      "Listen, kid — whatever's down there, we never talked. I was never here. Vane out.",
    ],
  },
  prospector: {
    name: "OLD PELL", color: "#ffd445",
    lines: [
      "You found one of the old relics, didn't you. I can hear it in the static. They sing, down there.",
      "Every relic's a piece of someone who came before. We all leave something in the rock, in the end.",
      "The deeper ones aren't human-made. Best not to dwell on who carved them.",
      "That idol with the eyes — heh. It's been watching you right back. Always has.",
      "When you reach the bottom, and you will: the rock didn't make that thing down there. That thing made the rock.",
    ],
  },
  buyer: {
    name: "MR. QUILL", color: "#c89aff",
    lines: [
      "Mr. Quill — private acquisitions. I buy what the company won't. Get rich, prospector; I'll be watching your account.",
      "Fifty thousand. Pocket change, but you're learning. Bring me the rare material.",
      "Two hundred grand — now we're talking. I have discerning clients for deep minerals.",
      "A millionaire. Marvellous. You and I should discuss an exclusive arrangement. Strictly between us.",
      "Whatever you haul up from the very bottom — name your price. I'll pay it, no questions. That's a promise.",
    ],
  },
};

export class RadioManager {
  constructor() {
    this.idx = {};
    this.queue = [];
    this.timer = 0;
    this.onMessage = null; // ({name,color,text}) => {}
    this.reset();
  }

  reset() {
    for (const k in RADIO_CAST) this.idx[k] = 0;
    this.queue = [];
    this.timer = 0;
  }

  // Advance an NPC's arc by one line and queue it (no-op once exhausted).
  transmit(key) {
    const npc = RADIO_CAST[key];
    if (!npc) return;
    const i = this.idx[key] || 0;
    if (i >= npc.lines.length) return;
    this.idx[key] = i + 1;
    this.queue.push({ name: npc.name, color: npc.color, text: npc.lines[i] });
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0 && this.queue.length) {
      const m = this.queue.shift();
      if (this.onMessage) this.onMessage(m);
      this.timer = 6.2; // spacing between transmissions
    }
  }
}
