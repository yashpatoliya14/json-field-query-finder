# SIFT — JSON Field & Value Prospecting

**SIFT** is a high-performance, web-based JSON field and query finder designed to effortlessly inspect, search, and navigate large JSON structures in real time. 

Built with React 19, TypeScript, Tailwind CSS v4, and `react-window` virtualization, Sift runs 100% in your browser — your data never leaves your tab.

---

## ✨ Features

- ⚡ **High-Performance JSON Tree Virtualization**: Smoothly renders large JSON payloads with thousands of nodes without browser lockup or scroll lag.
- 🔍 **Flexible Query & Search Engine**:
  - Filter by **Keys**, **Values**, or **Both**.
  - Toggle **Case Sensitivity**.
  - Full **Regular Expression (Regex)** support with live syntax error reporting.
- 🎯 **Match Ledger & Live Highlight Navigation**: Jump through search matches with keyboard shortcuts or single-click selection in the ledger.
- 📋 **One-Click Path Copying**: Copy exact JSONPath strings (e.g., `$.claims[0].patient.name`) directly to your clipboard.
- 📊 **Real-Time Document Insights**: Instant stats on node count, leaf count, container count, max tree depth, and total byte size.
- 🔒 **100% Private & Local**: Zero network requests — all parsing, searching, and rendering happen locally in browser memory.
- 📁 **Multiple Import Options**:
  - Paste raw JSON text directly into the source editor.
  - Upload JSON or plain text files (`.json`, `.txt`).
  - Load built-in sample JSON for immediate testing.

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite 7](https://vitejs.dev/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Virtualization**: [`react-window`](https://github.com/bvaughn/react-window)
- **Icons & Typography**: IBM Plex Sans, IBM Plex Mono, Space Grotesk

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v18 or higher recommended) and `npm` installed.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yashpatoliya14/json-field-query-finder.git
   cd json-field-query-finder
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Navigate to `http://localhost:5173` (or the URL shown in your terminal).

---

## 📦 Scripts

- `npm run dev`: Start Vite local development server.
- `npm run build`: Build production-ready bundle (single-file inline bundle).
- `npm run preview`: Locally preview the production build.

---

## 💡 Usage Guide

1. **Input JSON**: Click **Paste JSON**, upload a file using **Upload**, or click **Load sample**.
2. **Search**: Enter a term in the search box. Select search mode (**Keys**, **Values**, or **Both**), toggle **Aa** for case-sensitivity, or **.* ** for regex search.
3. **Navigate Matches**: Use **Prev** / **Next** buttons or click any item in the **Yield Ledger** on the left.
4. **Copy Path**: Hover over any row in the JSON map and click the **copy path** icon.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
