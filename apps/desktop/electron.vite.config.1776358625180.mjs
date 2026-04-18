// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
var __electron_vite_injected_dirname = "/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop";
var envPath = resolve(__electron_vite_injected_dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
var sharedEntry = resolve(__electron_vite_injected_dirname, "../../packages/shared/src/index.ts");
var serverEntry = resolve(__electron_vite_injected_dirname, "../../packages/server/src/index.ts");
var outRoot = "dist-electron";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@nakiros/server", "@nakiros/shared"] })],
    define: {
      "process.env.NAKIROS_API_KEY_STABLE": JSON.stringify(process.env.NAKIROS_API_KEY_STABLE ?? ""),
      "process.env.NAKIROS_API_KEY_BETA": JSON.stringify(process.env.NAKIROS_API_KEY_BETA ?? ""),
      "process.env.NAKIROS_FEEDBACK_KEY": JSON.stringify(process.env.NAKIROS_FEEDBACK_KEY ?? "")
    },
    resolve: {
      alias: {
        "@nakiros/shared": sharedEntry,
        "@nakiros/server": serverEntry
      }
    },
    build: {
      outDir: `${outRoot}/main`,
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "electron/main.ts") }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@nakiros/server", "@nakiros/shared"] })],
    resolve: {
      alias: {
        "@nakiros/shared": sharedEntry,
        "@nakiros/server": serverEntry
      }
    },
    build: {
      outDir: `${outRoot}/preload`,
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "electron/preload.ts") }
      }
    }
  },
  renderer: {
    root: "src",
    resolve: {
      alias: {
        "@nakiros/shared": sharedEntry,
        "@nakiros/server": serverEntry,
        "@": resolve(__electron_vite_injected_dirname, "src")
      }
    },
    build: {
      outDir: resolve(__electron_vite_injected_dirname, `${outRoot}/renderer`),
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "src/index.html") }
      }
    },
    plugins: [react(), tailwindcss()]
  }
});
export {
  electron_vite_config_default as default
};
