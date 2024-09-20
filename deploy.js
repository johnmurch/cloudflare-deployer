require("dotenv").config();

const fs = require("fs");
const path = require("path");
const util = require("util");
const axios = require("axios");
const exec = util.promisify(require("child_process").exec);

// Configuration variables
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// Function to automate the creation, pushing to GitHub, and deployment
async function deployHonoWorker(projectName) {
  const projectDir = path.join(__dirname, projectName);

  try {
    // Step 1: Create Project Directory
    console.log("Creating project directory...");
    fs.mkdirSync(projectDir);

    // Step 2: Initialize npm project
    console.log("Initializing npm project...");
    await exec("npm init -y", { cwd: projectDir });

    // Step 3: Install Hono
    console.log("Installing Hono...");
    await exec("npm install hono", { cwd: projectDir });

    // Step 4: Create Worker Script
    console.log("Creating worker script...");
    const honoScript = `
    import { Hono } from 'hono';
    const app = new Hono();
    app.get('/', (c) => c.text('Hello from ${projectName}!'));
    app.get('/robots.txt', (c) => {
      const robotsTxt = \`
    User-agent: *
    Disallow: /\`;
      return c.text(robotsTxt.trim(), 200, {
        'Content-Type': 'text/plain',
      });
    });
    export default app;
    `;
    fs.writeFileSync(path.join(projectDir, "index.js"), honoScript);

    // Step 5: Create Wrangler.toml manually
    console.log("Creating wrangler.toml...");
    const wranglerToml = `
name = "${projectName}"
main = "index.js"
compatibility_date = "${new Date().toISOString().split("T")[0]}"
account_id = "${CLOUDFLARE_ACCOUNT_ID}"
workers_dev = true
        `;
    fs.writeFileSync(path.join(projectDir, "wrangler.toml"), wranglerToml);

    // Step 6: Initialize Git Repository
    console.log("Initializing git repository...");
    await exec("git init", { cwd: projectDir });
    await exec("git add .", { cwd: projectDir });
    await exec('git commit -m "Initial commit for Hono Cloudflare Worker"', {
      cwd: projectDir
    });

    // Step 7: Create GitHub Repository using API
    console.log(`Creating GitHub repository: ${projectName}...`);
    const response = await axios.post(
      "https://api.github.com/user/repos",
      {
        name: projectName,
        private: true // default to private repo, but could set to false and its public on creation!
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`
        }
      }
    );

    const gitRepoUrl = response.data.clone_url.replace(
      "https://",
      `https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@`
    );
    console.log("Repository created:", gitRepoUrl);

    // Step 8: Add Remote and Push Code
    console.log("Pushing code to GitHub...");
    await exec(`git remote add origin ${gitRepoUrl}`, { cwd: projectDir });
    await exec("git push -u origin master", { cwd: projectDir });

    // Step 9: Deploy to Cloudflare
    console.log("Deploying to Cloudflare...");
    process.env.CLOUDFLARE_API_TOKEN = CLOUDFLARE_API_TOKEN;
    await exec("wrangler deploy", { cwd: projectDir });

    console.log(`Hono Cloudflare Worker ${projectName} deployed successfully!`);
  } catch (error) {
    console.error("Error during deployment:", error);
  }
}

// Run the script with a project name
const projectName = process.argv[2];
if (!projectName) {
  console.error("Please provide a project name.");
  process.exit(1);
}
deployHonoWorker(projectName);
