export type DeviceCategory = "phone" | "tablet" | "laptop";

export type Device = {
  id: string;
  name: string;
  category: DeviceCategory;
  batteryWh: number;
  maxWiredW: number;
  maxFastW: number;
  idlePowerW: number;
};

export const DEVICES: Device[] = [
  { id: "iphone-15",          name: "iPhone 15",            category: "phone",  batteryWh: 13.0, maxWiredW: 5,  maxFastW: 20, idlePowerW: 1.5 },
  { id: "iphone-15-pro-max",  name: "iPhone 15 Pro Max",    category: "phone",  batteryWh: 17.3, maxWiredW: 5,  maxFastW: 27, idlePowerW: 1.8 },
  { id: "samsung-s24",        name: "Samsung Galaxy S24",   category: "phone",  batteryWh: 15.4, maxWiredW: 10, maxFastW: 25, idlePowerW: 1.7 },
  { id: "pixel-8",            name: "Google Pixel 8",       category: "phone",  batteryWh: 17.1, maxWiredW: 10, maxFastW: 27, idlePowerW: 1.8 },
  { id: "ipad-air",           name: "iPad Air (M2)",        category: "tablet", batteryWh: 28.6, maxWiredW: 20, maxFastW: 20, idlePowerW: 4   },
  { id: "ipad-pro-11",        name: "iPad Pro 11\" (M4)",   category: "tablet", batteryWh: 31.3, maxWiredW: 20, maxFastW: 20, idlePowerW: 4.5 },
  { id: "macbook-air-m3",     name: "MacBook Air M3 13\"",  category: "laptop", batteryWh: 52.6, maxWiredW: 30, maxFastW: 30, idlePowerW: 7   },
  { id: "macbook-pro-14",     name: "MacBook Pro 14\" M3",  category: "laptop", batteryWh: 70.0, maxWiredW: 70, maxFastW: 70, idlePowerW: 10  },
  { id: "dell-xps-13",        name: "Dell XPS 13",          category: "laptop", batteryWh: 55.0, maxWiredW: 45, maxFastW: 60, idlePowerW: 8   },
  { id: "thinkpad-x1",        name: "ThinkPad X1 Carbon",   category: "laptop", batteryWh: 57.0, maxWiredW: 65, maxFastW: 65, idlePowerW: 8   },
];

export type Activity = "off" | "light" | "video" | "call" | "gaming" | "ai";

export const ACTIVITY_LABEL: Record<Activity, string> = {
  off:    "Off / locked",
  light:  "Light use (scrolling, messaging)",
  video:  "Streaming video",
  call:   "Video call",
  gaming: "Gaming",
  ai:     "AI chat / heavy compute",
};

export const ACTIVITY_EXTRA_W: Record<DeviceCategory, Record<Activity, number>> = {
  phone:  { off: 0, light: 1.5, video: 3,  call: 4,  gaming: 7,  ai: 5   },
  tablet: { off: 0, light: 2,   video: 5,  call: 6,  gaming: 10, ai: 7   },
  laptop: { off: 0, light: 4,   video: 8,  call: 12, gaming: 35, ai: 20  },
};

export function deviceById(id: string): Device {
  const d = DEVICES.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown device: ${id}`);
  return d;
}

export type Task = "ai" | "video-call" | "streaming" | "browsing" | "gaming";

export const TASK_LABEL: Record<Task, string> = {
  "ai":         "AI chat / LLM session",
  "video-call": "Video call",
  "streaming":  "Streaming video (HD)",
  "browsing":   "Web browsing",
  "gaming":     "Gaming",
};

export const TASK_EMOJI: Record<Task, string> = {
  "ai":         "🤖",
  "video-call": "📹",
  "streaming":  "📺",
  "browsing":   "🌐",
  "gaming":     "🎮",
};

export const TASK_POWER_W: Record<Task, Record<DeviceCategory, number>> = {
  "ai":         { phone: 4,  tablet: 8,  laptop: 18 },
  "video-call": { phone: 5,  tablet: 10, laptop: 25 },
  "streaming":  { phone: 4,  tablet: 8,  laptop: 18 },
  "browsing":   { phone: 3,  tablet: 6,  laptop: 12 },
  "gaming":     { phone: 8,  tablet: 12, laptop: 50 },
};

export const TASK_SERVER_G_PER_HOUR: Record<Task, number> = {
  "ai":         50,
  "video-call": 12,
  "streaming":  8,
  "browsing":   2,
  "gaming":     5,
};

// When task = "ai", the server share depends on what kind of AI work
export type AISubtask = "short-text" | "long-context" | "image-gen" | "video-gen";

export const AI_SUBTASK_LABEL: Record<AISubtask, string> = {
  "short-text":   "Short prompt / chat reply",
  "long-context": "Long context / research / coding",
  "image-gen":    "Image generation",
  "video-gen":    "Video generation",
};

export const AI_SUBTASK_EMOJI: Record<AISubtask, string> = {
  "short-text":   "💬",
  "long-context": "📚",
  "image-gen":    "🖼️",
  "video-gen":    "🎬",
};

// server-side carbon per hour of session, by AI subtype (typical mix of queries)
export const AI_SUBTASK_SERVER_G_PER_HOUR: Record<AISubtask, number> = {
  "short-text":    25,
  "long-context": 120,
  "image-gen":    180,
  "video-gen":    900,
};

// shorthand for the "typical per-output" cost (used as a callout)
export const AI_SUBTASK_PER_OUTPUT_G: Record<AISubtask, number> = {
  "short-text":     1,
  "long-context":  12,
  "image-gen":      3,
  "video-gen":     90,
};

export const CATEGORY_LABEL: Record<DeviceCategory, string> = {
  phone:  "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
};

export const CATEGORY_EMOJI: Record<DeviceCategory, string> = {
  phone:  "📱",
  tablet: "📲",
  laptop: "💻",
};
