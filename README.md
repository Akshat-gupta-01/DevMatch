# 🚀 DevMatch

DevMatch is a full-stack web application that connects developers based on their skills, interests, and collaboration goals. It helps developers find teammates, collaborate on projects, and build a strong professional network.

--- 

## 🌐 Live Demo

👉 https://dev-match-web.netlify.app/

---

## ✨ Features

* 🔐 Secure Authentication (JWT-based Login & Signup)
* 👤 Developer Profiles (skills, bio, projects)
* 🔍 Smart Developer Matching System
* ❤️ Like & Connect with Developers
* 💬 Real-time Chat (optional / extendable)
* 📂 Project Collaboration
* 📱 Fully Responsive Design

---

## 🛠️ Tech Stack

### Frontend

* React.js
* HTML5, CSS3
* Tailwind CSS / Bootstrap
* Axios

### Backend

* Node.js
* Express.js

### Database

* MongoDB

### Tools & Utilities

* Git & GitHub
* Postman
* JWT Authentication

---

## 📁 Project Structure

```
DevMatch/
│
├── client/          # React frontend
├── server/          # Node + Express backend
├── models/          # Database schemas
├── routes/          # API routes
├── controllers/     # Business logic
├── middleware/      # Authentication middleware
├── config/          # Database configuration
└── README.md
```

---

## ⚙️ Installation & Setup

```bash
# Clone the repository
git clone https://github.com/Akshat-gupta-01/DevMatch.git
cd DevMatch

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install

# Go back to root
cd ..

# Run backend (Terminal 1)
cd server && npm run dev

# Run frontend (Terminal 2)
cd client && npm start
```

---

## 🔑 Environment Variables

Create a `.env` file inside the **server folder** and add:

```
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

---

## 🌐 API Endpoints

### 🔐 Auth Routes

* `POST /api/auth/register` → Register user
* `POST /api/auth/login` → Login user

### 👤 User Routes

* `GET /api/users` → Get all users
* `GET /api/users/:id` → Get user profile

### 🤝 Match Routes

* `POST /api/match` → Match developers
* `GET /api/match/:id` → Get matches

---

## 🚀 Deployment

### Frontend (Vercel / Netlify)

```
npm run build
```

### Backend (Render / Railway)

* Set environment variables
* Deploy using GitHub integration

---

## 📸 Screenshots

*Add screenshots of your project here (UI, dashboard, matching system, etc.)*

---

## 🧪 Future Improvements

* 🔔 Notification system
* 🤖 AI-based developer matching
* 📹 Video collaboration
* 🌍 Advanced search & filters

---

## 🤝 Contributing

1. Fork the repository
2. Create a new branch

   ```
   git checkout -b feature-name
   ```
3. Commit your changes

   ```
   git commit -m "Added new feature"
   ```
4. Push to GitHub

   ```
   git push origin feature-name
   ```
5. Open a Pull Request 🚀

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

**Akshat Gupta**
GitHub: https://github.com/Akshat-gupta-01

---

## ⭐ Support

If you like this project, please give it a ⭐ and share it!

---
