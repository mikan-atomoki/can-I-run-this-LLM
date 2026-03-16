export interface DevicePreset {
  label: string;
  vram: number;
  ram: number;
  bw: number;
  category: string;
}

export const PRESETS: DevicePreset[] = [
  // NVIDIA
  { label: "RTX 4090 (24 GB)",        vram: 24, ram: 32, bw: 1008, category: "NVIDIA" },
  { label: "RTX 4080 Super (16 GB)",   vram: 16, ram: 32, bw: 736,  category: "NVIDIA" },
  { label: "RTX 4080 (16 GB)",         vram: 16, ram: 32, bw: 717,  category: "NVIDIA" },
  { label: "RTX 4070 Ti Super (16 GB)",vram: 16, ram: 32, bw: 672,  category: "NVIDIA" },
  { label: "RTX 4070 Ti (12 GB)",      vram: 12, ram: 16, bw: 504,  category: "NVIDIA" },
  { label: "RTX 4070 (12 GB)",         vram: 12, ram: 16, bw: 504,  category: "NVIDIA" },
  { label: "RTX 4060 Ti (8 GB)",       vram: 8,  ram: 16, bw: 288,  category: "NVIDIA" },
  { label: "RTX 4060 (8 GB)",          vram: 8,  ram: 16, bw: 272,  category: "NVIDIA" },
  { label: "RTX 3090 (24 GB)",         vram: 24, ram: 32, bw: 936,  category: "NVIDIA" },
  { label: "RTX 3080 (10 GB)",         vram: 10, ram: 16, bw: 760,  category: "NVIDIA" },
  { label: "RTX 3070 (8 GB)",          vram: 8,  ram: 16, bw: 448,  category: "NVIDIA" },
  { label: "RTX 3060 (12 GB)",         vram: 12, ram: 16, bw: 360,  category: "NVIDIA" },
  { label: "GTX 1080 Ti (11 GB)",      vram: 11, ram: 16, bw: 484,  category: "NVIDIA" },
  { label: "GTX 1660 Super (6 GB)",    vram: 6,  ram: 16, bw: 336,  category: "NVIDIA" },
  // AMD
  { label: "RX 7900 XTX (24 GB)",     vram: 24, ram: 32, bw: 960,  category: "AMD" },
  { label: "RX 7900 XT (20 GB)",      vram: 20, ram: 32, bw: 800,  category: "AMD" },
  { label: "RX 7800 XT (16 GB)",      vram: 16, ram: 16, bw: 624,  category: "AMD" },
  { label: "RX 7700 XT (12 GB)",      vram: 12, ram: 16, bw: 432,  category: "AMD" },
  { label: "RX 7600 (8 GB)",          vram: 8,  ram: 16, bw: 288,  category: "AMD" },
  // Apple Silicon (unified: vram = 75% of total)
  { label: "M4 Max (36 GB unified)",   vram: 27, ram: 36, bw: 546,  category: "Apple" },
  { label: "M4 Pro (24 GB unified)",   vram: 18, ram: 24, bw: 273,  category: "Apple" },
  { label: "M4 (16 GB unified)",       vram: 12, ram: 16, bw: 120,  category: "Apple" },
  { label: "M3 Ultra (64 GB unified)", vram: 48, ram: 64, bw: 800,  category: "Apple" },
  { label: "M3 Max (36 GB unified)",   vram: 27, ram: 36, bw: 400,  category: "Apple" },
  { label: "M3 Pro (18 GB unified)",   vram: 13, ram: 18, bw: 150,  category: "Apple" },
  { label: "M3 (8 GB unified)",        vram: 6,  ram: 8,  bw: 100,  category: "Apple" },
  { label: "M2 Ultra (64 GB unified)", vram: 48, ram: 64, bw: 800,  category: "Apple" },
  { label: "M2 Max (32 GB unified)",   vram: 24, ram: 32, bw: 400,  category: "Apple" },
  { label: "M2 Pro (16 GB unified)",   vram: 12, ram: 16, bw: 200,  category: "Apple" },
  { label: "M1 Max (32 GB unified)",   vram: 24, ram: 32, bw: 400,  category: "Apple" },
  { label: "M1 Pro (16 GB unified)",   vram: 12, ram: 16, bw: 200,  category: "Apple" },
  // Data center
  { label: "H100 (80 GB)",            vram: 80, ram: 64, bw: 3352, category: "Server" },
  { label: "A100 80GB",               vram: 80, ram: 64, bw: 2039, category: "Server" },
  { label: "A100 40GB",               vram: 40, ram: 64, bw: 1555, category: "Server" },
  { label: "L40S (48 GB)",            vram: 48, ram: 64, bw: 864,  category: "Server" },
];
