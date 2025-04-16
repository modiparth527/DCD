// execution/runner.js (Corrected Paths and Output Handling)
const fs = require('fs');
const path = require('path');

// --- Correct Paths relative to container structure ---
const SANDBOX_DIR = '/sandbox'; // Base directory where temp files are mounted
const CODE_FILE = path.join(SANDBOX_DIR, 'user_code.js'); // Correct path to user code
const INPUT_FILE = path.join(SANDBOX_DIR, 'input.json');  // Correct path to input data
// ----------------------------------------------------

// Helper to log consistently to stderr *without* extra characters
function logError(...args) {
    // Use console.error which writes to stderr by default
    console.error("RunnerLog:", ...args);
}

logError("Node runner script started."); // Keep only one start message

try {
    logError(`Runner Step 1: Checking input file: ${INPUT_FILE}`);
    if (!fs.existsSync(INPUT_FILE)) {
        throw new Error(`Input file not found: ${INPUT_FILE}`);
    }
    const inputRaw = fs.readFileSync(INPUT_FILE, 'utf8');
    logError("Runner Step 2: Input file read. Parsing JSON...");
    const inputData = JSON.parse(inputRaw);
    // Use JSON.stringify for logging objects cleanly
    logError("Runner Step 3: JSON Parsed:", JSON.stringify(inputData));

    const { functionName, inputArgs } = inputData;
    if (!functionName || !Array.isArray(inputArgs)) {
        throw new Error('Invalid input data format (missing functionName or inputArgs is not array).');
    }

    logError(`Runner Step 4: Checking code file: ${CODE_FILE}`);
    if (!fs.existsSync(CODE_FILE)) {
        throw new Error(`Code file not found: ${CODE_FILE}`);
    }

    logError(`Runner Step 5: Requiring code module...`);
    // Resolve the absolute path just in case require needs it
    const userCodeModule = require(path.resolve(CODE_FILE));
    logError("Runner Step 6: Code module required. Checking function...");

    if (typeof userCodeModule[functionName] !== 'function') {
        throw new Error(`Function '${functionName}' not found or not exported in user code: ${CODE_FILE}`);
    }
    const userFunction = userCodeModule[functionName];
    logError("Runner Step 7: Executing user function...");

    let result;
    // Execute user code
    // Special handling for reverseString if needed (though less common in JS)
    // if (functionName === "reverseString") { ... } else { ... }
    // Assuming standard call pattern for now:
    result = userFunction(...inputArgs);
    logError("Runner Step 8: Function executed.");


    const finalOutput = result; // JS handles undefined/null okay in JSON stringify
    logError(`Runner Step 9: Execution finished. Raw Result:`, finalOutput); // Log raw result

    // --- Write ONLY JSON SUCCESS to STDOUT ---
    const successPayload = { status: 'success', output: finalOutput };
    // Use process.stdout.write directly to avoid potential console.log formatting issues
    process.stdout.write(JSON.stringify(successPayload)); // NO newline added by default
    // --- End STDOUT write ---

    logError("Runner Step 10: Wrote success output to stdout.");

} catch (error) {
    logError("Runner Step E1: Error caught.", error.message); // Log the error message
    // Log stack trace for better debugging if needed
    logError("Stack Trace:", error.stack);

    // --- Write ONLY JSON ERROR to STDERR ---
    const errorPayload = {
        status: 'error',
        type: error.name || 'Error', // Get error type (e.g., 'Error', 'TypeError')
        error: error.message       // Get error message string
    };
    // Use process.stderr.write directly to avoid potential console.error formatting issues
    process.stderr.write(JSON.stringify(errorPayload) + '\n'); // Add newline for clarity in logs if read line-by-line
    // --- End STDERR write ---

    logError("Runner Step E2: Wrote error JSON to stderr.");
    process.exit(1); // Crucial: Exit with a non-zero code to indicate failure
}

logError("Runner finished normally."); // Should only be reached on success
// process.exit(0); // Optional: Explicit success exit code