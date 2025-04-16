// server.js (Corrected - Combined Output Parsing)

// Load environment variables from .env file at the very beginning
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Make sure to use promises version
const os = require('os');
const Docker = require('dockerode');
// --- MongoDB Added ---
const { MongoClient, ObjectId } = require('mongodb'); // Import MongoClient and ObjectId
// --- End MongoDB Added ---

const app = express();

// --- Environment Variables ---
const MONGODB_URI = process.env.MONGODB_URI; // Loaded from .env
const DB_NAME = process.env.DB_NAME || 'dailyCodingDose'; // Default DB name if not in .env
const PORT = process.env.PORT || 3000; // Use PORT from env or default to 3000
const NODE_ENV = process.env.NODE_ENV || 'development'; // Default to development

if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI environment variable is not set. Please create a .env file or set the environment variable.");
    process.exit(1); // Exit if connection string is missing
}

const docker = new Docker();

// --- MongoDB Client Setup ---
let db; // Variable to hold the database connection instance
const mongoClient = new MongoClient(MONGODB_URI);

async function connectToDb() {
    try {
        await mongoClient.connect(); // Establish connection
        db = mongoClient.db(DB_NAME); // Get database instance using DB_NAME
        console.log(`Successfully connected to MongoDB database: ${DB_NAME}`);

        // Optional: Ensure indexes exist for common queries (improves performance)
        await db.collection('problems').createIndex({ tags: 1 });
        await db.collection('problems').createIndex({ id: 1 }, { unique: true, sparse: true });
        console.log("Database indexes ensured for 'problems' collection.");

    } catch (err) {
        console.error("!!! Failed to connect to MongoDB", err);
        process.exit(1); // Exit the application if DB connection fails on startup
    }
}
// --- End MongoDB Setup ---


// --- Middleware ---
app.use(express.json()); // Parse incoming JSON request bodies

// --- Serve Static Files ---
const staticPath = NODE_ENV === 'production' ? 'dist' : 'public';
console.log(`Serving static files from ./${staticPath} (NODE_ENV=${NODE_ENV})`);
app.use(express.static(path.join(__dirname, staticPath)));


// --- Data ---
// Keep test cases hardcoded for now. Could be moved to DB later.
const testCases = {
    '1': [ { inputArgs: [[2, 7, 11, 15], 9], expectedOutput: '[0,1]' }, { inputArgs: [[3, 2, 4], 6], expectedOutput: '[1,2]' }, { inputArgs: [[3, 3], 6], expectedOutput: '[0,1]' } ],
    '2': [ { inputArgs: [['h','e','l','l','o']], expectedOutput: '["o","l","l","e","h"]' }, { inputArgs: [['H','a','n','n','a','h']], expectedOutput: '["h","a","n","n","a","H"]' } ],
    '3': [ { inputArgs: ["()"], expectedOutput: 'true' }, { inputArgs: ["()[]{}"], expectedOutput: 'true' }, { inputArgs: ["(]"], expectedOutput: 'false' }, { inputArgs: ["([)]"], expectedOutput: 'false' }, { inputArgs: ["{[]}"], expectedOutput: 'true' }, { inputArgs: ["]"], expectedOutput: 'false'} ],
    '4': [ { inputArgs: [[1,2,3,1]], expectedOutput: 'true' }, { inputArgs: [[1,2,3,4]], expectedOutput: 'false' }, { inputArgs: [[1,1,1,3,3,4,3,2,4,2]], expectedOutput: 'true' }, { inputArgs: [[]], expectedOutput: 'false' } ],
};

// --- API Endpoints ---

// GET /api/problems - List problems
app.get('/api/problems', async (req, res) => {
    console.log(`API REQ: GET /api/problems | Query:`, req.query);
    if (!db) {
        console.error("API ERROR: Database not available for /api/problems");
        return res.status(503).json({ error: "Service temporarily unavailable. Database not connected." });
    }
    const requestedTopic = req.query.topic;
    const query = {};
    const projection = { _id: 1, id: 1, title: 1 };
    try {
        if (requestedTopic) {
            query.tags = { $regex: new RegExp(`^${requestedTopic}$`, 'i') };
            console.log(`API LOG: Filtering DB query for topic: "${requestedTopic}"`);
        } else {
            console.log(`API LOG: No topic filter, fetching all problems from DB.`);
        }
        const problemsFromDb = await db.collection('problems').find(query).project(projection).toArray();
        console.log(`API LOG: Found ${problemsFromDb.length} problems from DB query.`);
        const problemList = problemsFromDb.map(p => ({
            id: p.id || p._id.toString(),
            title: p.title || "Untitled Problem"
        }));
        res.json(problemList);
    } catch (err) {
        console.error("API ERROR: Failed to fetch problems from database:", err);
        res.status(500).json({ error: "Failed to retrieve problems due to a server error." });
    }
});

// GET /api/problems/:id - Get single problem
app.get('/api/problems/:id', async (req, res) => {
    const requestedId = req.params.id;
    console.log(`API REQ: GET /api/problems/${requestedId}`);
    if (!db) {
        console.error("API ERROR: Database not available for /api/problems/:id");
        return res.status(503).json({ error: "Service temporarily unavailable. Database not connected." });
    }
    let queryFilter;
    if (ObjectId.isValid(requestedId)) {
        console.log("API LOG: Treating requested ID as potential ObjectId.");
        queryFilter = { $or: [{ _id: new ObjectId(requestedId) }, { id: requestedId }] };
    } else {
        console.log("API LOG: Treating requested ID as custom string ID.");
        queryFilter = { id: requestedId };
    }
    try {
        const problem = await db.collection('problems').findOne(queryFilter);
        if (problem) {
            console.log(`API LOG: Found problem in DB: ${problem.title}`);
            const responseProblem = { ...problem, id: problem.id || problem._id.toString() };
            delete responseProblem._id;
            res.json(responseProblem);
        } else {
            console.log(`API LOG: Problem ID ${requestedId} not found in DB.`);
            res.status(404).json({ error: 'Problem not found' });
        }
    } catch (err) {
        console.error(`API ERROR: Failed to fetch problem ${requestedId} from database:`, err);
        res.status(500).json({ error: "Failed to retrieve problem details due to a server error." });
    }
});

// POST /api/submit - Handle code execution
app.post('/api/submit', async (req, res) => {
    const { problemId, language, code } = req.body;
    const MAX_EXECUTION_TIME_MS = 15000;
    console.log(`API REQ: POST /api/submit | Problem: ${problemId} | Lang: ${language}`);

    // --- Validation ---
    if (!testCases[problemId]) {
        console.error(`API ERROR: Test cases for Problem ${problemId} not found.`);
        return res.status(404).json({ status: "Error", output: "Test cases for problem not found." });
    }
    if (!code) { return res.status(400).json({ status: "Error", output: "No code provided." }); }

    // --- Determine Image, File Names, Function Name ---
    let imageName, codeFileName, runnerScript;
    if (language === 'javascript') {
        imageName = 'dailycodedose/execution-node:latest'; codeFileName = 'user_code.js'; runnerScript = 'runner.js';
    } else if (language === 'python') {
        imageName = 'dailycodedose/execution-python:latest'; codeFileName = 'user_code.py'; runnerScript = 'runner.py';
    } else {
        return res.status(400).json({ status: "Error", output: `Language '${language}' not supported.` });
    }

    let functionName = '';
    const functionNameMap = { '1': 'twoSum', '2': 'reverseString', '3': 'isValid', '4': 'containsDuplicate' };
    functionName = functionNameMap[problemId];
    if (!functionName) { return res.status(500).json({status: "Error", output: "Server config error: Cannot determine function name."}); }
    console.log(`API LOG: Using function name "${functionName}" for execution.`);

    // --- Setup Execution ---
    const tests = testCases[problemId];
    let tempDir = null;
    let container = null; // Define container here to ensure it's accessible in finally

    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `dcd-${problemId}-${language}-`));
        await fs.writeFile(path.join(tempDir, codeFileName), code);
        const inputJsonPath = path.join(tempDir, 'input.json'); // Define path for input.json
        console.log(`API LOG: Created temp dir: ${tempDir}`);

        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            // Write input.json for the current test case
            const inputJson = JSON.stringify({ functionName, inputArgs: test.inputArgs });
            await fs.writeFile(inputJsonPath, inputJson);
            console.log(`API LOG: Running test ${i + 1}/${tests.length} for problem ${problemId}`);

            const containerConfig = {
                Image: imageName,
                Cmd: [language === 'javascript' ? 'node' : 'python', runnerScript],
                WorkingDir: '/usr/src/app',
                User: 'appuser',
                HostConfig: {
                    Binds: [
                        `${tempDir}:/sandbox:ro`,
                    ],
                    Memory: 128 * 1024 * 1024,
                    CpuQuota: 50000,
                    CpuPeriod: 100000,
                    NetworkMode: 'none',
                    ReadonlyRootfs: true,
                    Tmpfs: {'/tmp': 'rw,noexec,nosuid,size=5m'},
                    SecurityOpt: ['no-new-privileges'],
                    CapDrop: ['ALL'],
                },
                Tty: false, AttachStdout: true, AttachStderr: true,
            };

            // Reset variables for this test case
            container = null;
            let timeoutHit = false;
            // --- *** Use ONE variable for combined output *** ---
            let combinedOutput = '';
            // --- *** END CHANGE *** ---

            // Run container with timeout
            try {
                container = await docker.createContainer(containerConfig);
                const stream = await container.attach({ stream: true, stdout: true, stderr: true });

                // --- *** MODIFIED Stream Handling: Capture ALL output *** ---
                stream.on('data', (chunk) => {
                    // Append chunk payload (stripping 8-byte header) to combined output
                    try { // Add try-catch around buffer operations
                         if (chunk.length > 8) {
                            combinedOutput += chunk.slice(8).toString('utf8');
                         } else {
                            // Handle cases where chunk might be smaller than header (less likely but possible)
                            console.warn(`API WARN: Received small chunk (length ${chunk.length}), appending raw: ${chunk.toString('utf8')}`);
                            combinedOutput += chunk.toString('utf8');
                         }
                    } catch (bufferError) {
                         console.error("API ERROR: Error processing stream chunk buffer:", bufferError);
                         // Append raw chunk as fallback
                         combinedOutput += chunk.toString('utf8');
                    }
                });
                // --- *** END MODIFIED SECTION *** ---

                const streamEndPromise = new Promise(resolve => stream.on('end', resolve));

                await container.start();
                console.log(`API LOG: Container started for test ${i + 1}. Waiting...`);

                const waitPromise = container.wait({ condition: 'not-running' });
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => {
                        timeoutHit = true;
                        console.warn(`API WARN: Timeout triggered for test ${i + 1}.`);
                        reject(new Error('Execution timed out'));
                    }, MAX_EXECUTION_TIME_MS)
                );

                await Promise.race([waitPromise, timeoutPromise]);
                console.log(`API LOG: Container wait/timeout finished for test ${i + 1}. Timeout hit: ${timeoutHit}`);

                await Promise.race([
                     streamEndPromise,
                     new Promise(resolve => setTimeout(resolve, 200)) // Max 200ms wait for stream end
                ]);
                 console.log(`API LOG: Docker stream ended or timed out waiting for end for test ${i+1}.`);

            } catch (waitError) {
                console.error(new Date(), `API ERROR: Container run/wait failed for test ${i+1}. Timeout flag: ${timeoutHit}`, waitError);
                if (timeoutHit) {
                    if (container) { try { await container.stop({ t: 1 }); } catch (stopErr) { console.warn(`API WARN: Failed to stop timed-out container: ${stopErr.message}`); } }
                    throw { status: "Time Limit Exceeded", output: `Test ${i + 1}: Execution exceeded ${MAX_EXECUTION_TIME_MS / 1000}s.` };
                } else {
                    throw { status: "Runtime Error", output: `Test ${i + 1}: Container execution failed: ${waitError.message}` };
                }
            } finally {
                 if (container) {
                    try {
                        console.log(`API LOG: Attempting removal of container for test ${i+1}...`);
                        await container.remove({ force: true });
                        console.log(`API LOG: Removed container for test ${i+1}.`);
                        container = null;
                    } catch (rmErr) {
                        if (!rmErr.message || (rmErr.statusCode !== 404 && !rmErr.message.includes("No such container"))) {
                             console.error(`API ERROR: Failed to remove container for test ${i+1}:`, rmErr);
                        } else {
                             console.log(`API LOG: Container for test ${i+1} already removed or not found.`);
                        }
                        container = null;
                    }
                 }
            }

            // --- *** MODIFIED Log Processing: Search Combined Output *** ---
            console.log(`API LOG: Combined container output for test ${i+1}:\n---\n${combinedOutput}\n---`);

            let stdoutJson = null; // To store the parsed success JSON
            let stderrJson = null; // To store the parsed error JSON

            const outputLines = combinedOutput.trim().split('\n'); // Split combined output into lines

            // Iterate through lines to find the LAST valid success or error JSON payload
            for (const line of outputLines) {
                const trimmedLine = line.trim();
                // Check if line looks like a JSON object before attempting to parse
                if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
                    try {
                        const p = JSON.parse(trimmedLine);

                        // Check for SUCCESS format
                        if (p && p.status === 'success' && p.output !== undefined) {
                            stdoutJson = p;
                            stderrJson = null; // Clear potential error found on previous lines
                            console.log(`API LOG: Found potential success JSON line: ${trimmedLine}`);
                        }
                        // Check for ERROR format
                        else if (p && p.status === 'error' && (p.type !== undefined || p.message !== undefined || p.error !== undefined)) {
                            stderrJson = p;
                            stdoutJson = null; // Clear potential success found on previous lines
                            console.error(`API ERROR: Found potential error JSON line: ${trimmedLine}`);
                        }
                    } catch (e) {
                        // Ignore lines that look like JSON but fail to parse
                        console.debug(`API DEBUG: Ignoring line that failed JSON parse: "${trimmedLine}", Error: ${e.message}`);
                    }
                } else {
                     // Optional: Log lines that don't even look like JSON objects
                     // console.debug(`API DEBUG: Ignoring non-object line: "${trimmedLine}"`);
                }
            }

            // Now, check the results based on the *last* valid JSON found
            if (stderrJson) {
                // Found a valid error JSON as the last result
                console.error(`API ERROR: Final decision - Runner reported error for test ${i+1}:`, stderrJson);
                const errMsg = stderrJson.message || stderrJson.error || 'Unknown runner error';
                const errType = stderrJson.type || 'Error';
                throw { status: "Runtime Error", output: `Test ${i + 1} (${errType}): ${errMsg}` };
            }
            else if (stdoutJson) {
                 // Found a valid success JSON as the last result
                console.log(`API LOG: Final decision - Parsed success JSON.`);
                const actual = JSON.stringify(stdoutJson.output);
                const expected = test.expectedOutput;
                console.log(`API LOG: Test ${i+1} Expected: ${expected}, Got: ${actual}`);
                if (actual !== expected) {
                    throw { status: "Wrong Answer", output: `Test ${i + 1}:\nInput: ${JSON.stringify(test.inputArgs)}\nExpected: ${expected}\nGot: ${actual}`};
                }
                // If output matches, continue
            } else {
                // If NO valid success or error JSON was found anywhere in the output
                console.error(`API ERROR: Final decision - No valid JSON output (status: success/error) identified in combined logs for test ${i+1}.`);
                const rawErrorOutput = combinedOutput.trim() || '(No logs captured)';
                throw { status: "Runtime Error", output: `Test ${i + 1}: No valid output received from execution environment. Logs:\n${rawErrorOutput}` };
            }
            // --- *** END MODIFIED Log Processing *** ---

            console.log(`API LOG: Test ${i + 1} Passed.`);
        } // End test loop

        // If loop finishes without throwing error
        console.log(`API LOG: Submission Accepted for problem ${problemId}.`);
        res.json({ status: "Accepted", output: "All test cases passed!" });

    } catch (error) {
        // Handle errors thrown from within the loop (Wrong Answer, TLE, Runtime Error) or setup errors
        console.error(`API ERROR: Submission processing failed. Status: ${error.status || 'Unknown'}, Output: ${error.output || error.message}`);
        if (!error.status) { console.error("Full error object:", error); }

        if (error.status && error.output) {
            res.status(200).json({ status: error.status, output: error.output }); // Send structured error as 200 OK
        } else {
            // Fallback for unexpected server errors
            res.status(500).json({ status: "Server Error", output: `An internal error occurred processing the submission.` });
        }
    } finally {
        // Cleanup temp directory
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
                console.log(`API LOG: Cleaned up temp dir: ${tempDir}`);
            } catch (cleanupError) {
                console.error(`API ERROR: Failed to cleanup temp dir ${tempDir}:`, cleanupError);
            }
        }
        container = null; // Ensure container ref is cleared
    }
}); // End POST /api/submit


// --- HTML Serving Routes ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, staticPath, 'index.html')); });
const staticHtmlFiles = ['problems-all', 'problems-topic', 'topics', 'problem'];
staticHtmlFiles.forEach(page => { app.get(`/${page}.html`, (req, res, next) => {
     const filePath = path.join(__dirname, staticPath, `${page}.html`);
     fs.access(filePath).then(() => res.sendFile(filePath)).catch(() => next());
    });
});
app.get('/theory-:topicName.html', (req, res, next) => {
    const topicName = req.params.topicName;
    if (!/^[a-zA-Z0-9\-]+$/.test(topicName)) { return next(); }
    const filePath = path.join(__dirname, staticPath, `theory-${topicName}.html`);
    fs.access(filePath, fs.constants.R_OK).then(() => res.sendFile(filePath)).catch(() => next());
});

// --- Catch-all and 404 ---
if (NODE_ENV === 'production') {
    app.get('*', (req, res, next) => {
        if (req.originalUrl.startsWith('/api/')) { return next(); }
        console.log(`Serving ${staticPath}/index.html for unmatched route: ${req.originalUrl}`);
        res.sendFile(path.join(__dirname, staticPath, 'index.html'));
    });
}
app.use((req, res) => {
    console.log(`WARN: 404 Not Found for route: ${req.originalUrl}`);
    // Ensure 404.html exists in your static assets directory (public or dist)
    const fourOhFourPath = path.join(__dirname, staticPath, '404.html');
    fs.access(fourOhFourPath)
      .then(() => res.status(404).sendFile(fourOhFourPath))
      .catch(() => res.status(404).send("404 Not Found")); // Fallback text if 404.html is missing
});


// --- Start Server ---
connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`------------------------------------------------------`);
        console.log(`Daily Coding Dose Server running at http://localhost:${PORT}`);
        console.log(`NODE_ENV: ${NODE_ENV}`);
        console.log(`Serving static files from: ./${staticPath}`);
        console.log(`Connected to MongoDB: ${DB_NAME}`);
        console.log(`Ensure Docker daemon is running for code execution.`);
        console.log(`Docker images should contain runner scripts in /usr/src/app`);
        console.log(`------------------------------------------------------`);
    });
}).catch(err => {
     console.error("!!! SERVER FAILED TO START due to DB connection error:", err);
     process.exit(1);
});