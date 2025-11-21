# 8x8 API Desktop Tool

A cross-platform desktop application to interact with the 8x8 API, built with Electron, React, and TailwindCSS.

## Features
- **Search**: Filter interactions by date range and agent.
- **Results**: View a list of evaluations with scores and details.
- **Details**: View full call transcripts and evaluation scorecards.
- **Settings**: Configure your 8x8 API credentials (Region and Bearer Token).

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation
```bash
npm install
```

### Development
To start the application in development mode:
```bash
npm run electron:dev
```

### Build
To create a distributable application:
```bash
npm run build
```

## Configuration
1. Launch the app.
2. Go to **Settings**.
3. Enter your 8x8 API Region (e.g., `us-west`) and Bearer Token.
4. Save configuration.

## Tech Stack
- **Electron**: Desktop runtime.
- **React**: UI library.
- **Vite**: Build tool.
- **TailwindCSS**: Styling.
- **TypeScript**: Type safety.
