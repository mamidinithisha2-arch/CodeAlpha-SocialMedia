const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("./database.js");

const app = express();
const PORT = 3000;
const JWT_SECRET = "codealpha_socialmedia_secret";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Test route
app.get("/api/test", (req, res) => {
    res.json({
        message: "Social Media backend is working!"
    });
});

// Register
app.post("/api/register", (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            error: "Name, email, and password are required."
        });
    }

    bcrypt.hash(password, 10, (error, passwordHash) => {
        if (error) {
            return res.status(500).json({
                error: "Could not secure password."
            });
        }

        const sql = `
            INSERT INTO users (name, email, password_hash)
            VALUES (?, ?, ?)
        `;

        db.run(sql, [name, email, passwordHash], function (dbError) {
            if (dbError) {
                if (dbError.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        error: "An account with this email already exists."
                    });
                }

                return res.status(500).json({
                    error: "Could not create account."
                });
            }

            res.status(201).json({
                message: "Account created successfully!"
            });
        });
    });
});

// Login
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: "Email and password are required."
        });
    }

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],
        (error, user) => {

            if (error) {
                return res.status(500).json({
                    error: "Could not log in."
                });
            }

            if (!user) {
                return res.status(401).json({
                    error: "Email or password is incorrect."
                });
            }

            bcrypt.compare(
                password,
                user.password_hash,
                (compareError, isMatch) => {

                    if (compareError || !isMatch) {
                        return res.status(401).json({
                            error: "Email or password is incorrect."
                        });
                    }

                    const token = jwt.sign(
                        {
                            id: user.id,
                            name: user.name,
                            email: user.email
                        },
                        JWT_SECRET,
                        { expiresIn: "1h" }
                    );

                    res.json({
                        message: "Login successful!",
                        token: token,
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email
                        }
                    });
                }
            );
        }
    );
});
// Create Post
app.post("/api/posts", (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        const { content } = req.body;

        if (!content || content.trim() === "") {
            return res.status(400).json({
                error: "Post content is required."
            });
        }

        const sql = `
            INSERT INTO posts (user_id, content)
            VALUES (?, ?)
        `;

        db.run(sql, [decoded.id, content], function(error) {

            if (error) {
                return res.status(500).json({
                    error: "Could not create post."
                });
            }

            res.status(201).json({
                message: "Post created successfully!",
                postId: this.lastID
            });
        });

    } catch (error) {
        res.status(401).json({
            error: "Invalid or expired login."
        });
    }
});
// Get all posts
app.get("/api/posts", (req, res) => {

    const sql = `
        SELECT
            posts.id,
            posts.content,
            posts.created_at,
            users.name
        FROM posts
        JOIN users ON posts.user_id = users.id
        ORDER BY posts.created_at DESC
    `;

    db.all(sql, [], (error, posts) => {

        if (error) {
            return res.status(500).json({
                error: "Could not load posts."
            });
        }

        res.json(posts);
    });
});
// Like / Unlike Post
app.post("/api/posts/:id/like", (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;
        const postId = req.params.id;

        db.get(
            "SELECT * FROM likes WHERE user_id = ? AND post_id = ?",
            [userId, postId],
            (error, existingLike) => {

                if (error) {
                    return res.status(500).json({
                        error: "Could not check like."
                    });
                }

                if (existingLike) {

                    db.run(
                        "DELETE FROM likes WHERE user_id = ? AND post_id = ?",
                        [userId, postId],
                        (deleteError) => {

                            if (deleteError) {
                                return res.status(500).json({
                                    error: "Could not unlike post."
                                });
                            }

                            res.json({
                                message: "Post unliked."
                            });
                        }
                    );

                } else {

                    db.run(
                        "INSERT INTO likes (user_id, post_id) VALUES (?, ?)",
                        [userId, postId],
                        (insertError) => {

                            if (insertError) {
                                return res.status(500).json({
                                    error: "Could not like post."
                                });
                            }

                            res.json({
                                message: "Post liked."
                            });
                        }
                    );
                }
            }
        );

    } catch (error) {
        res.status(401).json({
            error: "Invalid or expired login."
        });
    }
});
// Add Comment
app.post("/api/posts/:id/comments", (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(token, JWT_SECRET);

        const postId = req.params.id;
        const { content } = req.body;

        if (!content || content.trim() === "") {
            return res.status(400).json({
                error: "Comment cannot be empty."
            });
        }

        const sql = `
            INSERT INTO comments (user_id, post_id, content)
            VALUES (?, ?, ?)
        `;

        db.run(
            sql,
            [decoded.id, postId, content.trim()],
            function(error) {

                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        error: "Could not add comment."
                    });
                }

                res.status(201).json({
                    message: "Comment added successfully!",
                    commentId: this.lastID
                });

            }
        );

    } catch (error) {

        res.status(401).json({
            error: "Invalid or expired login."
        });

    }

});


// Get Comments for a Post
app.get("/api/posts/:id/comments", (req, res) => {

    const postId = req.params.id;

    const sql = `
        SELECT
            comments.id,
            comments.content,
            comments.created_at,
            users.name
        FROM comments
        JOIN users ON comments.user_id = users.id
        WHERE comments.post_id = ?
        ORDER BY comments.created_at ASC
    `;

    db.all(sql, [postId], (error, comments) => {

        if (error) {
            console.error(error);

            return res.status(500).json({
                error: "Could not load comments."
            });
        }

        res.json(comments);

    });

});
// ==============================
// GET MY PROFILE
// ==============================

app.get("/api/profile", (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(token, JWT_SECRET);

        const userId = decoded.id;

        const sql = `
            SELECT
                users.id,
                users.name,
                users.email,
                users.bio,

                (SELECT COUNT(*)
                 FROM posts
                 WHERE posts.user_id = users.id) AS posts_count,

                (SELECT COUNT(*)
                 FROM followers
                 WHERE followers.following_id = users.id) AS followers_count,

                (SELECT COUNT(*)
                 FROM followers
                 WHERE followers.follower_id = users.id) AS following_count

            FROM users

            WHERE users.id = ?
        `;

        db.get(sql, [userId], (error, user) => {

            if (error) {
                console.error(error);

                return res.status(500).json({
                    error: "Could not load profile."
                });
            }

            if (!user) {
                return res.status(404).json({
                    error: "User not found."
                });
            }

            res.json(user);

        });

    } catch (error) {

        res.status(401).json({
            error: "Invalid or expired login."
        });

    }

});


// ==============================
// UPDATE MY BIO
// ==============================

app.put("/api/profile", (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(token, JWT_SECRET);

        const userId = decoded.id;

        const { bio } = req.body;

        db.run(
            "UPDATE users SET bio = ? WHERE id = ?",
            [bio || "", userId],
            function(error) {

                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        error: "Could not update profile."
                    });
                }

                res.json({
                    message: "Profile updated successfully!"
                });

            }
        );

    } catch (error) {

        res.status(401).json({
            error: "Invalid or expired login."
        });

    }

});
// ==============================
// FOLLOW / UNFOLLOW USER
// ==============================

app.post("/api/users/:id/follow", (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(token, JWT_SECRET);

        const followerId = decoded.id;
        const followingId = req.params.id;

        // User cannot follow themselves
        if (followerId == followingId) {
            return res.status(400).json({
                error: "You cannot follow yourself."
            });
        }

        // Check if already following
        db.get(
            `SELECT * FROM followers
             WHERE follower_id = ?
             AND following_id = ?`,
            [followerId, followingId],
            (error, existingFollow) => {

                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        error: "Could not check follow status."
                    });
                }

                // Already following → Unfollow
                if (existingFollow) {

                    db.run(
                        `DELETE FROM followers
                         WHERE follower_id = ?
                         AND following_id = ?`,
                        [followerId, followingId],
                        (deleteError) => {

                            if (deleteError) {
                                console.error(deleteError);

                                return res.status(500).json({
                                    error: "Could not unfollow user."
                                });
                            }

                            res.json({
                                message: "User unfollowed."
                            });

                        }
                    );

                }

                // Not following → Follow
                else {

                    db.run(
                        `INSERT INTO followers
                         (follower_id, following_id)
                         VALUES (?, ?)`,
                        [followerId, followingId],
                        (insertError) => {

                            if (insertError) {
                                console.error(insertError);

                                return res.status(500).json({
                                    error: "Could not follow user."
                                });
                            }

                            res.json({
                                message: "User followed."
                            });

                        }
                    );

                }

            }
        );

    } catch (error) {

        res.status(401).json({
            error: "Invalid or expired login."
        });

    }

});


// ==============================
// CHECK FOLLOW STATUS
// ==============================

app.get("/api/users/:id/follow-status", (req, res) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(token, JWT_SECRET);

        const followerId = decoded.id;
        const followingId = req.params.id;

        db.get(
            `SELECT * FROM followers
             WHERE follower_id = ?
             AND following_id = ?`,
            [followerId, followingId],
            (error, follow) => {

                if (error) {
                    return res.status(500).json({
                        error: "Could not check follow status."
                    });
                }

                res.json({
                    following: !!follow
                });

            }
        );

    } catch (error) {

        res.status(401).json({
            error: "Invalid or expired login."
        });

    }

});
// ==============================
// GET ALL USERS
// ==============================

app.get("/api/users", (req, res) => {
    const sql = `
        SELECT id, name, email, bio
        FROM users
        ORDER BY name ASC
    `;

    db.all(sql, [], (error, users) => {
        if (error) {
            console.error(error);
            return res.status(500).json({
                error: "Could not load users."
            });
        }

        res.json(users);
    });
});
// ==============================
// GET FOLLOWER COUNT
// ==============================

app.get("/api/users/:id/followers-count", (req, res) => {

    const userId = req.params.id;

    db.get(
        `SELECT COUNT(*) AS count
         FROM followers
         WHERE following_id = ?`,
        [userId],
        (error, result) => {

            if (error) {
                console.error(error);
                return res.status(500).json({
                    error: "Could not get follower count."
                });
            }

            res.json({
                count: result.count
            });
        }
    );
});


// ==============================
// GET FOLLOWING COUNT
// ==============================

app.get("/api/users/:id/following-count", (req, res) => {

    const userId = req.params.id;

    db.get(
        `SELECT COUNT(*) AS count
         FROM followers
         WHERE follower_id = ?`,
        [userId],
        (error, result) => {

            if (error) {
                console.error(error);
                return res.status(500).json({
                    error: "Could not get following count."
                });
            }

            res.json({
                count: result.count
            });
        }
    );
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});