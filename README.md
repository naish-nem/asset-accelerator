# 🚀 Asset Accelerator

**A creative engine for rapid, modular prototyping of game scenes and scenarios in 2D and 3D.**

[![Watch Demo](https://img.shields.io/badge/Watch-YouTube_Demo-FF0000?style=for-the-badge&logo=youtube)](https://www.youtube.com/watch?v=XDjETtoTKUI)
[![GitHub Repo](https://img.shields.io/badge/GitHub-naish--nem%2Fasset--accelerator-181717?style=for-the-badge&logo=github)](https://github.com/naish-nem/asset-accelerator)

## 🎯 The Vision
Asset Accelerator is built to eliminate the bottleneck of asset creation during game prototyping. By combining a sleek Next.js web frontend, cutting-edge token compression, rapid 2D image generation, and instantaneous 3D extrusion, developers can turn a simple text prompt into ready-to-use 2D sprites or fully textured 3D models. These assets are then injected seamlessly into a listening Unity game engine via API—all within seconds.

## ✨ Core Features
* **Web-Based Prototyping Hub:** A responsive Next.js/React frontend where users can generate, manage, and extract assets outside of the game engine.
* **Prompt Optimization:** Uses intelligent token compression middleware to reduce API payload bloat and latency before generation even begins.
* **Rapid 2D Prototyping:** Instantly generates high-quality 2D scenarios and concept art based on user prompts.
* **Interactive Asset Extraction:** Users draw bounding boxes directly on the React UI to isolate and extract specific game assets from the generated scenes.
* **Remote Unity Injection:** One-click import functionality that pings a live Unity instance via API to drop assets directly into 2D or 3D environments.
* **Instant 3D Conversion:** Converts extracted 2D flat assets into fully textured 3D meshes with a single click before sending them to the engine.



## 🏗️ Pipeline Architecture
1. **Input & Compression:** The user enters a scene prompt into the Next.js web app. To optimize for speed, the Python backend passes the prompt through the **bear-1.2** compression model by **The Token Company** to strip context bloat.
2. **2D Generation:** The compressed prompt is sent to **Flux Schnell** (by Black Forest Labs), which generates the full 2D scenario image and returns it to the web UI.
3. **Extraction:** The user drags bounding boxes around the specific assets they want on the frontend (e.g., a character, a prop, or a weapon) to extract them from the background.
4. **Branching Workflows & Injection:**
   * **The 2D Route:** The user selects the extracted PNGs and clicks "Import." The backend sends the payload to the Unity API, which injects it into a 2D Unity game as playable sprites.
   * **The 3D Route:** The user clicks "Convert to 3D". The assets are routed to **Stable Fast 3D** (by Stability.ai) to extrude the 2D images into 3D `.glb` models. The user then clicks "Import," sending the 3D assets to the Unity API for instant instantiation in a 3D environment.

## 🛠️ Tech Stack
* **Frontend:** Next.js, React
* **Backend:** Python, REST APIs
* **Game Engine Receiver:** Unity (C# API endpoint for remote asset injection)
* **Prompt Compression:** `bear-1.2` API by The Token Company
* **2D Generation:** Flux Schnell API by Black Forest Labs
* **3D Generation:** Stable Fast 3D API by Stability.ai

## 🚀 Getting Started

### Prerequisites
* Node.js & npm (for the Next.js frontend)
* Python 3.9+ 
* Unity 2022.3+ (configured to receive API payloads)

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/naish-nem/asset-accelerator.git](https://github.com/naish-nem/asset-accelerator.git)
   cd asset-accelerator
   ```

2. **Start the Python backend:**
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```

3. **Start the Next.js frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

4. **Environment Setup:** Set your required API keys (The Token Company, Stability.ai, Black Forest Labs) in your `.env` files for both the frontend and backend.
5. **Unity Setup:** Open the Unity receiver project, enter Play Mode, and use the web interface to start injecting assets!

## 🔭 Next Steps
* **Auto-Rigging & Animation:** Integrate an auto-rigging API to automatically apply skeletons and basic animations to the generated 3D humanoid models before Unity injection.
* **Native Unity Plugin:** Package the API listener into a native Unity Package Manager (UPM) tool so developers can trigger the web interface directly from a Unity Editor window.
* **Local Inference Support:** Add toggleable support for local, offline models (like ComfyUI workflows) to completely eliminate API costs for developers with powerful GPUs.
* **Sprite Sheet Generation:** Expand the 2D pipeline to automatically generate and slice walking/running sprite sheets for 2D character assets.