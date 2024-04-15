const express = require("express");
const app = express();
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Post = require("./models/Post");
// Set the view engine to use EJS
app.set("view engine", "ejs");
// Serve static files from the 'public' directory
app.use(express.static("public"));
// Parse URL-encoded bodies for form data
app.use(bodyParser.urlencoded({ extended: true }));
// Define the port number to listen on
const PORT = process.env.PORT || 3000;
// Connect to MongoDB Atlas database
mongoose
  .connect("mongodb+srv://sakshiojha914:Ukt7MnpXLj4rthSY@cluster0.fcl7dhm.mongodb.net/")
  .then(() => console.log("Connected to DB"))
  .catch((err) => console.log(err));
// Set up session middleware to manage user sessions using MongoDB for storage
app.use(
  session({
    secret: "your_secret_key", // Secret key used to sign the session ID cookie
    resave: false, // Do not save session data if not modified
    saveUninitialized: true, // Save new sessions that have not been modified
    store: MongoStore.create({
      mongoUrl: "mongodb+srv://sakshiojha914:Ukt7MnpXLj4rthSY@cluster0.fcl7dhm.mongodb.net/",
      // Connects session storage to MongoDB Atlas using the specified URL
    }),
    cookie: { maxAge: 180 * 60 * 1000 }, // Set session cookie expiration time (in milliseconds)
  })
);

function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  // If 'userId' exists in the session, proceed to the next middleware
  res.redirect("/login");
  // If 'userId' does not exist in the session, redirect to the login page
}

function isAdmin(req, res, next) {
  if (req.session.role === "admin") return next();
  // If the user has 'admin' role in the session, proceed to the next middleware
  res.status(403).send("Not authorized");
  // If the user does not have 'admin' role, send a 403 Forbidden response
}

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  // Find user in the database by email
  const user = await User.findOne({ email });
  // Check if user exists
  if (!user) {
    // If user does not exist, send a 401 Unauthorized response
    return res.status(401).send("User not found");
  }
  // Assuming `user.comparePassword` is a callback-based method to compare passwords
  user.comparePassword(password, (err, isMatch) => {
    if (err) {
      // If there's an error comparing passwords, log the error and send a 500 Internal Server Error response
      console.error("Error comparing passwords:", err);
      return res.status(500).send("Internal server error");
    }

    if (!isMatch) {
      // If passwords do not match, log the incorrect password and send a 401 Unauthorized response
      console.log("Incorrect password:", password);
      return res.status(401).send("Incorrect password");
    }
    // If passwords match, set userId and role in session and redirect based on user's role
    req.session.userId = user._id; // Set user's _id in session
    req.session.role = user.role; // Set user's role in session
    // Redirect user based on their role
    res.redirect(user.role === "admin" ? "/admin" : "/");
  });
});

app.get("/post/:id", async (req, res) => {
  try {
    // Find the post by its ID
    const post = await Post.findById(req.params.id); // Check if the post exists
    if (!post) {
      // If post is not found, send a 404 Not Found response
      return res.status(404).send("Post not found");
    } // Find the user by userId stored in session
    const user = await User.findById(req.session.userId); // Render the 'postDetail' view and pass data to the template
    res.render("postDetail", { post, username: user?.username, req }); // Pass the request object to the template (not typically needed in rendering)
  } catch (error) {
    // Handle any errors that occur during the process
    console.log(error);
    res.status(500).send("Error fetching post details");
  }
});

app.get("/all-posts", async (req, res) => {
  try {
    // Retrieve all posts from the database, sorted by publishDate in descending order
    const posts = await Post.find().sort({ publishDate: -1 });
    // Render the 'allPosts' view and pass the retrieved posts and request object to the template
    res.render("allPosts", { posts, req });
  } catch (error) {
    // Handle any errors that occur during the process
    console.log(error);
    res.status(500).send("Error fetching all posts");
  }
});

app.get("/admin/posts/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Find the post by its ID
    const post = await Post.findById(req.params.id);
    // Check if the post exists
    if (!post) {
      return res.status(404).send("Post not found");
    }
    const user = await User.findById(req.session.userId); // Render the 'postDetail' view and pass data to the template
    res.render("postDetail", { post, username: user?.username, req });
  } catch (error) {
    // Handle any errors that occur during the process
    console.log(error);
    res.status(500).send("Error fetching post details");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      // If there's an error destroying the session, redirect to the home page ("/")
      return res.redirect("/");
    } // Clear the session cookie
    res.clearCookie("connect.sid");
    // Redirect to the login page ("/login") after successful logout
    res.redirect("/login");
  });
});

app.get("/login", (req, res) => {
  // Render the 'login' view and pass any message stored in the session to the template
  res.render("login", { message: req.session.message, req });
});

app.get("/admin", isAuthenticated, isAdmin, async (req, res) => {
  // Retrieve all posts and users from the database
  const posts = await Post.find();
  const users = await User.find();
  // Render the 'adminDashboard' view and pass data to the template
  res.render("adminDashboard", { posts, req, users });
});

app.get("/user", isAuthenticated, async (req, res) => {
  // Retrieve all posts from the database
  const posts = await Post.find(); // Render the 'userDashboard' view and pass data to the template
  res.render("userDashboard", { posts, req });
});

app.get("/posts/new", isAuthenticated, (req, res) => {
  // Render the 'newPost' view
  res.render("newPost", { req });
});
// Route to create a new post by authenticated users

app.post("/user/posts", isAuthenticated, async (req, res) => {
  const { title, intro, content, author, image, link } = req.body;
  const newPost = new Post({ title, intro, content, author, image, link });
  await newPost.save();
  res.redirect("/user");
});
// Route to render the form for editing a post by admin users

app.get("/admin/posts/edit/:id", isAuthenticated, isAdmin, async (req, res) => {
  const post = await Post.findById(req.params.id);
  res.render("editPost", { post, req });
});
// Route to render the form for creating a new user by admin users

app.get("/admin/users/new", isAuthenticated, isAdmin, (req, res) => {
  res.render("createUser", { req });
});
// Route to handle creation of a new user by admin users

app.post("/admin/users/create", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    console.log("User data to be saved:", {
      username,
      email,
      password,
      role,
    });

    const newUser = new User({
      username,
      email,
      password,
      role,
    });
    await newUser.save();
    console.log("User saved to database:", newUser);
    res.redirect("/admin");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error creating new user");
  }
});
// Route to render the form for editing a user by admin users

app.get("/admin/users/edit/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    res.render("editUser", { user, req });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error fetching user data");
  }
});
// Route to handle updating user details by admin users

app.post(
  "/admin/users/edit/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const { username, email, password, role } = req.body;
      const hashedPassword = await bcrypt.hash(password, 12);
      await User.findByIdAndUpdate(req.params.id, {
        username,
        email,
        password: hashedPassword,
        role,
      });
      res.redirect("/admin");
    } catch (error) {
      console.log(error);
      res.status(500).send("Error updating user details");
    }
  }
);
// Route to search for users based on username or email by admin users

app.get("/admin/users/search", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { query } = req.query;
    const users = await User.find({
      $or: [
        { username: { $regex: new RegExp(query, "i") } },
        { email: { $regex: new RegExp(query, "i") } },
      ],
    });
    const posts = await Post.find();

    res.render("adminDashboard", { users, posts, req });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error searching users");
  }
});
// Route to add a comment to a post by postId

app.post("/posts/:postId/comments", async (req, res) => {
  try {
    const { postId } = req.params;
    const { author, content } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).send("Post not found");
    }

    if (!post.comments) {
      post.comments = [];
    }

    post.comments.push({ author, content });
    await post.save();

    res.redirect(`/post/${postId}`);
  } catch (error) {
    console.log(error);
    res.status(500).send("Error adding comment");
  }
});
// Route to delete a user by admin users

app.get(
  "/admin/users/delete/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      await User.findByIdAndDelete(req.params.id);
      res.redirect("/admin");
    } catch (error) {
      console.log(error);
      res.status(500).send("Error deleting user");
    }
  }
);
// Route to update a post by admin users

app.post(
  "/admin/posts/edit/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { title, intro, content, author, image } = req.body;
    await Post.findByIdAndUpdate(req.params.id, {
      title,
      intro,
      content,
      author,
      image,
    });
    res.redirect("/admin");
  }
);
// Route to delete a post by admin users

app.get(
  "/admin/posts/delete/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    await Post.findByIdAndDelete(req.params.id);
    res.redirect("/admin");
  }
);
// Default route to render the homepage with latest posts

app.get("/", async (req, res) => {
  const posts = await Post.find().sort({ publishDate: -1 }).limit(10);
  res.render("index", { posts, req });
}); // Start the Express server

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
