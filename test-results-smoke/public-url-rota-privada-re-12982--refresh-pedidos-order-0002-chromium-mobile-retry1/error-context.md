# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:import-analysis] Failed to resolve import \"@/app\" from \"src/main.tsx\". Does the file exist?"
  - generic [ref=e5]: C:/Users/Usuario/Desktop/Projeto_jungle/src/main.tsx:3:20
  - generic [ref=e6]: "2 | import React from \"react\"; 3 | import { createRoot } from \"react-dom/client\"; 4 | import { App } from \"@/app\"; | ^ 5 | import \"@/index.css\"; 6 | async function bootstrap() {"
  - generic [ref=e7]: at TransformPluginContext._formatLog (file:///C:/Users/Usuario/Desktop/Projeto_jungle/node_modules/vite/dist/node/chunks/config.js:29250:43) at TransformPluginContext.error (file:///C:/Users/Usuario/Desktop/Projeto_jungle/node_modules/vite/dist/node/chunks/config.js:29247:14) at normalizeUrl (file:///C:/Users/Usuario/Desktop/Projeto_jungle/node_modules/vite/dist/node/chunks/config.js:27370:18) at process.processTicksAndRejections (node:internal/process/task_queues:104:5) at async file:///C:/Users/Usuario/Desktop/Projeto_jungle/node_modules/vite/dist/node/chunks/config.js:27428:32 at async Promise.all (index 3) at async TransformPluginContext.transform (file:///C:/Users/Usuario/Desktop/Projeto_jungle/node_modules/vite/dist/node/chunks/config.js:27396:4) at async EnvironmentPluginContainer.transform (file:///C:/Users/Usuario/Desktop/Projeto_jungle/node_modules/vite/dist/node/chunks/config.js:29048:14) at async loadAndTransform (file:///C:/Users/Usuario/Desktop/Projeto_jungle/node_modules/vite/dist/node/chunks/config.js:22914:26)
  - generic [ref=e8]:
    - text: Click outside, press Esc key, or fix the code to dismiss.
    - text: You can also disable this overlay by setting
    - code [ref=e9]: server.hmr.overlay
    - text: to
    - code [ref=e10]: "false"
    - text: in
    - code [ref=e11]: vite.config.js
    - text: .
```