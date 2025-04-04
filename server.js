// server.js

// 1. Import the Express library
const express = require('express');
const path = require('path'); // Needed to help find our frontend files
const fs = require('fs'); // Needed for the INSECURE code execution
const { exec } = require('child_process'); // Needed for the INSECURE code execution

// 2. Create an instance of the Express application
const app = express();
const PORT = 3000; // The "port" number our server will listen on

// 3. Middleware: These run for every request
app.use(express.json()); // Allow the server to understand incoming JSON data (like our submission)
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (HTML, CSS, JS) from the 'public' folder

// --- Hardcoded Data (Instead of a Database for now) ---

const problems = [
     {
        id: '1',
        title: "Two Sum",
        description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. Assume exactly one solution exists.",
        examples: [
            { input: "nums = [2,7,11,15], target = 9", output: "[0,1]" },
            { input: "nums = [3,2,4], target = 6", output: "[1,2]" }
        ],
        defaultCode: {
            javascript: `function twoSum(nums, target) {\n  // Write your code here\n  // Example: return [0, 1];};`,
            python: `from typing import List\n\ndef twoSum(nums: List[int], target: int) -> List[int]:\n    # Write your Python code here\n    pass`
        },
        tags: ["Array", "HashTable"]
    },
     {
        id: '2',
        title: "Reverse String",
        description: "Write a function that reverses a string. The input string is given as an array of characters s.",
        examples: [
            { input: 's = ["h","e","l","l","o"]', output: '["o","l","l","e","h"]' }
        ],
        defaultCode: {
             javascript: `function reverseString(s) {\n  // Write your code here\n  // Example: s.reverse();\n};`,
             python: `from typing import List\n\ndef reverseString(s: List[str]) -> None:\n    """\n    Do not return anything, modify s in-place instead.\n    """\n    # Write your Python code here\n    pass`
            
        },
        tags: ["String", "Array", "Two Pointers"]
    }
];

// Very simple test cases - doesn't handle complex input/output formats well yet
const testCases = {
    '1': [ // Two Sum
        { inputArgs: [[2, 7, 11, 15], 9], expectedOutput: '[0,1]' }, // Output as JSON string for simple comparison
        { inputArgs: [[3, 2, 4], 6], expectedOutput: '[1,2]' },
        { inputArgs: [[3, 3], 6], expectedOutput: '[0,1]' },
    ],
    '2': [ // Reverse String (NOTE: This function modifies the input array in place in JS)
        { inputArgs: [['h','e','l','l','o']], expectedOutput: '["o","l","l","e","h"]' },
        { inputArgs: [['H','a','n','n','a','h']], expectedOutput: '["h","a","n","n","a","H"]' }
    ]
};

// --- API Endpoints (URLs the frontend will talk to) ---

// GET /api/problems - Send a list of available problems
app.get('/api/problems', (req, res) => {
    const problemList = problems.map(p => ({ id: p.id, title: p.title }));
    res.json(problemList); // Send back the list as JSON data
});

// GET /api/problems - Send a list of available problems (optionally filtered by topic)
app.get('/api/problems/:id', (req, res) => {

    const problemId = req.params.id; // Get the ID from the URL (e.g., '/api/problems/1')    
    const problem = problems.find(id => id.id === problemId);
    
    if (problem) {
        // Only send needed info, not test cases
        const { description, examples, defaultCode, title, id } = problem;
        res.json({ description, examples, defaultCode, title, id });
    } else {
        res.status(404).json({ error: 'Problem not found' }); // Send a 404 error if ID is invalid
    }
    // const requestedTopic = req.query.topic; // Get 'topic' from query string (e.g., /api/problems?topic=Array)
    // console.log("Requessssssssted topic", requestedTopic)
    // let allProblems = problems; // Get all problem objects

    // let filteredProblems;
    // if (requestedTopic) {
    //     // Filter problems: check if the problem's tags array (case-insensitive) includes the requested topic (case-insensitive)
    //     const lowerCaseTopic = requestedTopic.toLowerCase();
    //     filteredProblems = allProblems.filter(p =>
    //         p.tags && Array.isArray(p.tags) && p.tags.some(tag => tag.toLowerCase() === lowerCaseTopic)
    //     );
    // } else {
    //     // If no topic specified, return all problems
    //     filteredProblems = allProblems;
    // }

    // // Only send back the ID and title for the list view
    // const problemList = filteredProblems.map(p => ({ id: p.id, title: p.title }));
    // res.json(problemList); // Send back the (potentially filtered) list as JSON
});

// POST /api/submit - Handle JS and Python submissions (INSECURE EXECUTION)
app.post('/api/submit', async (req, res) => {
    // 1. Get data from the frontend request
    const { problemId, language, code } = req.body;

    // 2. Basic Validation (Check if problem exists, code is provided)
    if (!problems[problemId] || !testCases[problemId]) {
        return res.status(404).json({ status: "Error", output: "Problem or test cases not found." });
    }
    if (!code) {
         return res.status(400).json({ status: "Error", output: "No code provided." });
    }
    // *** NEW: Check if the requested language is one we currently support ***
    if (language !== 'javascript' && language !== 'python') {
        return res.status(400).json({ status: "Error", output: `Language '${language}' not supported yet.` });
    }

    // 3. Prepare variables (some will be set based on the language)
    const tests = testCases[problemId];
    let finalResult = { status: "Accepted", output: "All test cases passed!" }; // Assume success initially

    let fileExtension;          // Will be '.js' or '.py'
    let tempFileNameBase = `temp_submission_${Date.now()}`; // Base name for the temp file
    let tempFilePath;           // Full path to the temp file
    let runCommand;             // A function that creates the command string (e.g., 'node file.js ...' or 'python file.py ...')
    let runnerCode = '';        // The code (including user's code + our wrapper) to write to the temp file

    // *** NEW: Determine function name based on problemId (same as before, but needed for both languages) ***
    let functionName = '';
     if (problemId === '1') functionName = 'twoSum';
     else if (problemId === '2') functionName = 'reverseString';
     // Add more mappings if you add problems
    if (!functionName) {
        // If we forgot to map a problemId, send an error
        return res.status(500).json({status: "Error", output: "Server error: Could not determine function name for problem."});
    }


    // 4. *** NEW: Use a switch (or if/else if) to set up language-specific things ***
    switch (language) {
        case 'javascript':
            fileExtension = '.js';
            tempFilePath = path.join(__dirname, tempFileNameBase + fileExtension);
            // Create the full JS code to execute (User Code + Runner Code)
            runnerCode = `
                ${code} // User's code is pasted here
                // Our JS runner code starts
                const testInputArgs = JSON.parse(process.argv[2]); // Get input from command line arg
                try {
                    let result;
                    if ("${functionName}" === "reverseString") { // Handle inplace modification case
                        let inputArgCopy = [...testInputArgs[0]];
                        ${functionName}(inputArgCopy);
                        result = inputArgCopy;
                    } else { // Standard function call
                        result = ${functionName}(...testInputArgs);
                    }
                    console.log(JSON.stringify(result !== undefined ? result : null)); // Print result as JSON
                } catch (error) {
                    console.error("ExecutionError:", error.message); // Print errors to stderr
                    process.exit(1); // Exit with error status
                }`;
            // Define how to run this file
            runCommand = (inputJson) => `node "${tempFilePath}" "${inputJson.replace(/"/g, '\\"')}"`;
            break; // End of JavaScript case

        case 'python': // *** THIS IS THE NEWLY ADDED CASE ***
            fileExtension = '.py';
            tempFilePath = path.join(__dirname, tempFileNameBase + fileExtension);
            // Create the full Python code to execute (User Code + Runner Code)
            runnerCode = `
# Python standard libraries needed by the runner
import sys
import json
from copy import deepcopy

# --- User's code starts ---
${code}
# --- User's code ends ---

# --- Our Python runner code starts ---
if __name__ == "__main__": # Standard Python entry point check
    try:
        # Get the JSON input string from the command line argument
        raw_args = sys.argv[1]
        try:
            test_input_args = json.loads(raw_args) # Parse JSON input
        except json.JSONDecodeError:
             corrected_raw_args = raw_args.replace('\\\\"', '"') # Handle potential shell escaping
             test_input_args = json.loads(corrected_raw_args)

        # Make a copy of input args in case the user function modifies them
        args_copy = deepcopy(test_input_args)

        result = None # Initialize result variable
        if "${functionName}" == "reverseString": # Handle inplace modification case
            ${functionName}(args_copy[0]) # Call function (modifies args_copy[0])
            result = args_copy[0] # Result is the modified list
        else: # Standard function call
            result = ${functionName}(*args_copy) # Unpack list elements as arguments

        # Print the result as a JSON string to standard output
        print(json.dumps(result if result is not None else None))

    except Exception as e:
        # If any error occurs during execution, print it to standard error
        print(f"ExecutionError: {e}", file=sys.stderr)
        sys.exit(1) # Exit with a non-zero code to indicate failure
`;
            // Define how to run this file (use 'python' command)
            runCommand = (inputJson) => `python "${tempFilePath}" "${inputJson.replace(/"/g, '\\"')}"`;
            break; // End of Python case

        // If language was something else (though we checked earlier), do nothing
        // default:
        //     // This shouldn't be reached due to the check at the start
        //     break;
    } // End of switch statement


    // 5. Execute the code (This part is mostly the same, but uses the 'runCommand' variable)
    try {
        // Write the appropriate runnerCode to the temporary file
        fs.writeFileSync(tempFilePath, runnerCode);

        // Loop through each test case for the problem
        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            // Convert the test case input arguments to a JSON string
            const inputJson = JSON.stringify(test.inputArgs);
            // Get the correct command (e.g., 'node ...' or 'python ...')
            const commandToRun = runCommand(inputJson);

            // Execute the command in a separate process
            // Use a Promise to wait for the asynchronous 'exec' to finish
            await new Promise((resolve, reject) => {
                exec(commandToRun, { timeout: 2000 }, (error, stdout, stderr) => { // 2 second limit
                    // Check if the process terminated with an error
                    if (error) {
                        if (error.signal === 'SIGTERM' || (error.killed && error.signal === null)) { // Check for timeout
                            return reject({ status: "Time Limit Exceeded", output: `Test ${i + 1}: Execution timed out.` });
                        }
                        // For other errors, use stderr if available, otherwise error message
                        return reject({ status: "Runtime Error", output: `Test ${i + 1}: ${stderr || error.message}` });
                    }
                    // *** MODIFIED: Check stderr even if no 'error' object ***
                    // Python often prints tracebacks to stderr on runtime errors without 'error' necessarily being set
                    if (stderr && language === 'python') { // Be more strict with Python stderr
                         return reject({ status: "Runtime Error", output: `Test ${i + 1}: ${stderr}` });
                    } else if (stderr) { // Log stderr for JS just in case, but don't fail automatically
                         console.warn(`Test ${i+1} (${language}) stderr: ${stderr}`);
                    }


                    // Compare the standard output (result) with the expected output
                    const actualOutput = stdout.trim(); // Remove extra whitespace
                    if (actualOutput !== test.expectedOutput) {
                        // If outputs don't match, reject with "Wrong Answer"
                        return reject({
                            status: "Wrong Answer",
                            output: `Test ${i + 1}:\nInput: ${inputJson}\nExpected: ${test.expectedOutput}\nGot: ${actualOutput}`
                        });
                    }

                    // If we got here, this test case passed! Resolve the promise.
                    resolve();
                }); // End of exec callback
            }); // End of Promise for one test case
        } // End of loop through test cases

        // If the loop completes without any rejected promises, all tests passed!
        res.json(finalResult); // Send { status: "Accepted", ... }

    } catch (failedResultOrError) {
        // This 'catch' block catches any rejected promise from the loop (WA, TLE, RE)
        // or any synchronous error before the loop
        if (failedResultOrError.status) { // If it's our structured error object
             res.json(failedResultOrError); // Send the specific failure result (WA, TLE, RE)
        } else { // If it's some other unexpected server error
             console.error("Unexpected server error during execution:", failedResultOrError);
             res.status(500).json({ status: "Server Error", output: "An internal error occurred." });
        }
    } finally {
        // 6. Cleanup (This part is the same)
        // Always try to delete the temporary file after execution finishes or fails
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error(`Error deleting temp file ${tempFilePath}:`, err);
            });
        }
    }
});


// 4. Start the server and make it listen for requests
app.listen(PORT, () => {
    console.log(`Daily Coding Dose Server is running at http://localhost:${PORT}`);
    console.log("Navigate to http://localhost:3000 in your browser to access Daily Coding Dose.");
    console.warn("!!! WARNING: Code execution in this server is INSECURE and only for local testing. !!!");
});