# 🐾 CatVerse — The Social Network for Cat Lovers

CatVerse is a full-featured, real-time social media web application built specifically for cats and cat lovers.

![CatVerse Preview](https://raw.githubusercontent.com/CrimsonOnGit-hub/CatVerse/main/assets/preview.png)

## ✨ Features

- **🐾 Real-Time Feed:** Share cat photography and stories with rich captions, tags, and interactive likes/comments.
- **🤖 Neural AI Cat Verification:** In-browser deep learning neural network (TensorFlow.js + MobileNet) that inspects every uploaded photo in real time to verify feline subjects and identify breeds before posting.
- **🎬 CatTakes Video Platform:** Short-form cat clips with live in-browser webcam recording & direct video uploads.
- **👥 Friends & Social Discovery:** Search community members, send friend requests, view active friend lists, and filter by dedicated Friends feed.
- **🐬 MySQL Database & REST API:** Fully relational backend supporting MySQL / MariaDB and SQLite with table schemas for users, posts, likes, comments, and friendships.
- **⚡ Live WebSockets:** Instant real-time multi-user synchronization across all connected devices with zero page refresh.
- **🌓 Adaptive Theme:** Automatic OS/device dark & light mode synchronization with live manual toggle.
- **📱 Native Mobile UI:** Responsive layout with fixed bottom navigation bar, safe-area-inset support, and pull-up bottom sheets.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/CrimsonOnGit-hub/CatVerse.git
cd CatVerse
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Database (Optional)
Copy or edit `.env` with your MySQL credentials:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=catverse_db
DB_PORT=3306
PORT=8085
```
*(If MySQL is not running, the server automatically uses the embedded relational SQLite database).*

### 4. Start the server
```bash
npm start
```
Open **http://localhost:8085** in your browser!

---

## 📂 Project Structure

```
├── index.html       # Semantic HTML5 frontend layout & modals
├── styles.css       # Facebook-style design system & mobile stylesheet
├── app.js           # Frontend client controller & WebSocket receiver
├── server.js        # Node.js + Express backend & WebSocket server
├── schema.sql       # MySQL relational database schema
├── package.json     # Node dependencies & start scripts
└── .env             # Environment configuration
```

---

## 📄 License
MIT © 2026 CatVerse
