-- ============================================================
-- CatVerse MySQL Database Schema
-- Compatible with MySQL 5.7+, MySQL 8.0+, MariaDB, phpMyAdmin, PlanetScale
-- ============================================================

CREATE DATABASE IF NOT EXISTS catverse_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE catverse_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    bio TEXT,
    avatar LONGTEXT,
    created_at BIGINT NOT NULL,
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Posts Table (Cat Photos & CatTake Videos)
CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(64) PRIMARY KEY,
    author_username VARCHAR(50) NOT NULL,
    type ENUM('cat', 'cattake') NOT NULL DEFAULT 'cat',
    cat_name VARCHAR(100),
    title VARCHAR(200),
    description TEXT,
    media LONGTEXT,
    media_type VARCHAR(20) DEFAULT 'image',
    ai_breed VARCHAR(100),
    ai_confidence INT DEFAULT 100,
    tags TEXT,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (author_username) REFERENCES users(username) ON DELETE CASCADE,
    INDEX idx_author (author_username),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Post Likes Table
CREATE TABLE IF NOT EXISTS likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id VARCHAR(64) NOT NULL,
    username VARCHAR(50) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY unique_like (post_id, username),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Post Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(64) PRIMARY KEY,
    post_id VARCHAR(64) NOT NULL,
    author_username VARCHAR(50) NOT NULL,
    comment_text TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (author_username) REFERENCES users(username) ON DELETE CASCADE,
    INDEX idx_post_comments (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Friends Table (Bidirectional Friendships)
CREATE TABLE IF NOT EXISTS friends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_a VARCHAR(50) NOT NULL,
    user_b VARCHAR(50) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY unique_friendship (user_a, user_b),
    FOREIGN KEY (user_a) REFERENCES users(username) ON DELETE CASCADE,
    FOREIGN KEY (user_b) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Saved / Bookmarked Posts Table
CREATE TABLE IF NOT EXISTS saved_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    post_id VARCHAR(64) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY unique_save (username, post_id),
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
