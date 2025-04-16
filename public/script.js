// public/script.js (With Logging in loadProblemList)

// --- CodeMirror Imports ---
import { EditorState, StateEffect } from "@codemirror/state"; // Added StateEffect
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from 'codemirror';
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

console.log("Script loaded (Module).");

// --- Helper Functions ---
function getUrlQueryParam(paramName) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(paramName);
}
function getProblemIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// --- Global Editor Variables ---
let editorView = null;
let editorState = null;

// --- Load Problem List (WITH INTENSE LOGGING) ---
async function loadProblemList() {
    console.log("--- loadProblemList START ---"); // Start marker
    const problemListElement = document.getElementById('problem-list');
    const pageTitleElement = document.querySelector('main h2');

    // 1. Check elements
    if (!problemListElement) { console.error("!!! ERROR: #problem-list element NOT FOUND."); return; }
    else { console.log("Element #problem-list found."); }
    if (!pageTitleElement) { console.warn("WARN: main h2 element not found."); }
    else { console.log("Element main h2 found."); }

    // 2. Determine API URL / Title
    const topic = getUrlQueryParam('topic');
    let apiUrl = '/api/problems'; // Vite proxy handles target
    let pageTitle = "All Available Problems";
    if (topic) {
        console.log(`Topic detected: "${topic}"`);
        apiUrl += `?topic=${encodeURIComponent(topic)}`;
        pageTitle = `Problems - Topic: ${topic}`;
    } else {
         console.log("No topic detected.");
    }
    if (pageTitleElement) {
        pageTitleElement.textContent = pageTitle;
        console.log(`Page title set to: "${pageTitle}"`);
    }

    // 3. Set loading message
    console.log("Setting loading message...");
    try {
        problemListElement.innerHTML = '<li>Loading problems...</li>';
        console.log("Loading message set.");
    } catch(domError) {
         console.error("!!! ERROR setting loading message:", domError);
         return; // Cannot proceed
    }

    try {
        // 4. Fetch data
        console.log(`Fetching problems from: ${apiUrl}`);
        const response = await fetch(apiUrl);
        console.log(`Fetch response status: ${response.status}`);
        if (!response.ok) { throw new Error(`Server responded with status: ${response.status}`); }

        // 5. Parse JSON
        console.log("Parsing JSON response...");
        const problems = await response.json();
        console.log("JSON parsed successfully. Problems received:", problems); // <<< SEE THIS?

        // 6. Validate received data
        if (!problems || !Array.isArray(problems)) {
             console.error("!!! ERROR: Received data is not a valid array.", problems);
             problemListElement.textContent = 'Error: Invalid data format received.';
             return;
        }
        console.log(`Received ${problems.length} problems.`);

        // 7. Clear loading message (Check immediately after)
        console.log("Clearing loading message (setting innerHTML to '')...");
        problemListElement.innerHTML = ''; // <<< DOES THIS CAUSE AN ERROR?
        console.log("innerHTML after clear:", problemListElement.innerHTML); // Should be empty ""

        // 8. Handle empty list case
        if (problems.length === 0) {
            problemListElement.innerHTML = `<li>No problems found${topic ? ' for this topic' : ''}.</li>`;
            console.log("Displayed 'No problems found'.");
            console.log("--- loadProblemList END (No Problems) ---");
            return; // Exit function
        }

        // 9. Loop and Append problems
        console.log("Starting loop to append problems...");
        problems.forEach((problem, index) => { // <<< DOES IT ENTER THIS LOOP?
            console.log(`  Loop ${index}: Processing problem ID ${problem?.id}, Title: ${problem?.title}`); // Use optional chaining ?.

            if (!problem || typeof problem.id === 'undefined' || typeof problem.title === 'undefined') {
                console.warn(`  Loop ${index}: !!! Skipping invalid problem object:`, problem);
                return; // Skip this iteration
            }

            try { // try-catch around DOM operations for this specific item
                const li = document.createElement('li');
                const link = document.createElement('a');
                link.href = `/problem.html?id=${problem.id}`; // Use leading slash
                link.textContent = problem.title;
                console.log(`    Appending link for "${problem.title}"`); // <<< SEE THIS?
                li.appendChild(link);
                problemListElement.appendChild(li); // <<< DOES THIS CAUSE AN ERROR?
                 console.log(`    Appended li for ID ${problem.id}. Current list count: ${problemListElement.children.length}`); // <<< SEE THIS?
            } catch (loopDomError) {
                console.error(`!!! ERROR appending problem at index ${index} (ID: ${problem.id}):`, loopDomError);
            }
        });
        console.log("Finished loop."); // <<< SEE THIS?
        console.log("--- loadProblemList END (Success) ---"); // <<< SEE THIS?

    } catch (error) {
        console.error("--- loadProblemList END (Error Caught) ---"); // <<< OR DOES IT END HERE?
        console.error("Error loading/processing problems:", error);
        if (problemListElement) { problemListElement.innerHTML = `<li>Error loading problems: ${error.message}. Check console.</li>`; }
        else { console.error("Cannot display error message because #problem-list element is missing."); }
    }
}


// --- Load Problem Details (Your Modified Version) ---
async function loadProblemDetails() {
    console.log("loadProblemDetails executing...");
    const problemId = getProblemIdFromUrl();
    const titleElement = document.getElementById('problem-title');
    const descriptionElement = document.getElementById('problem-description');
    const examplesElement = document.getElementById('problem-examples');
    const editorContainerElement = document.getElementById('code-editor-container'); // Using container ID
    const submitBtn = document.getElementById('submit-btn');
    const resultOutputElement = document.getElementById('result-output');
    const languageSelectElement = document.getElementById('language-select');

    // Element Existence Check
    if (!titleElement || !descriptionElement || !examplesElement || !editorContainerElement || !submitBtn || !resultOutputElement || !languageSelectElement) {
        console.error("FATAL: Missing essential elements on problem page.");
        if(document.body) document.body.innerHTML = "<h1>Page Load Error</h1><p>Essential page components are missing.</p>";
        return;
    }
    // Check for Problem ID
    if (!problemId) {
        console.error("FATAL: No problem ID found in URL.");
        titleElement.textContent = "Error";
        descriptionElement.textContent = "No problem ID specified in the URL.";
        languageSelectElement.disabled = true;
        submitBtn.disabled = true;
        editorContainerElement.textContent = "// Cannot load problem - ID missing.";
        return;
    }

    console.log(`Attempting to load problem ID: "${problemId}"`);
    let loadedProblemData = null;

    try {
        const apiUrl = `/api/problems/${problemId}`; // Let proxy handle
        console.log(`Fetching problem details from: ${apiUrl}`);
        const response = await fetch(apiUrl);
        if (!response.ok) {
             let errorMsg = `Server responded with status: ${response.status}`;
             if (response.status === 404) { errorMsg = 'Problem not found on server.'; }
             else { try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch(e) {/* ignore */} }
             throw new Error(errorMsg);
        }

        const problem = await response.json();
        console.log("Problem details received:", problem);
        loadedProblemData = problem;

        // Populate Title, Description
        titleElement.textContent = problem.title || "Untitled Problem";
        document.title = `DCD - ${problem.title || 'Problem'}`;
        descriptionElement.textContent = problem.description || "No description provided.";

        // Populate Examples (Your modified version)
        examplesElement.innerHTML = ''; // Clear
        if (problem.examples && Array.isArray(problem.examples) && problem.examples.length > 0) {
            const escapeHtml = (unsafe) => { // Using corrected escape
                if (typeof unsafe !== 'string') return 'N/A';
                return  unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
            };
            console.log(`Populating ${problem.examples.length} examples...`);
            problem.examples.forEach((ex, index) => {
                // Using template literal and += (Be careful with += innerHTML performance on large loops)
                const exampleHTML = `
                    <div class="example-block">
                        <h4>Example ${index + 1}</h4>
                        <pre><strong>Input:</strong>\n${escapeHtml(ex.input)}</pre>
                        <pre><strong>Output:</strong>\n${escapeHtml(ex.output)}</pre>
                    </div>`;
                try {
                    examplesElement.innerHTML += exampleHTML; // Append HTML string
                } catch(exDomError) {
                     console.error(`Error adding example ${index+1} HTML:`, exDomError);
                     // Optionally display an error message for this example
                     examplesElement.innerHTML += `<div class="example-block" style="color:red;">Error displaying Example ${index+1}.</div>`;
                }
            });
             console.log("Finished populating examples.");
        } else {
            examplesElement.innerHTML = '<p>No examples provided.</p>';
        }

        // Initialize CodeMirror
        console.log("Initializing CodeMirror...");
        const getLanguageExtension = (lang) => (lang === 'python' ? python() : javascript());
        const createEditorState = (doc, language) => EditorState.create({
            doc: doc || '', extensions: [ basicSetup, keymap.of([...defaultKeymap, indentWithTab]), getLanguageExtension(language), oneDark, EditorView.contentAttributes.of({ autocapitalize: "none", autocorrect: "off", spellcheck: "false" }) ]
        });
        const initialLanguage = languageSelectElement.value;
        const initialCode = loadedProblemData?.defaultCode?.[initialLanguage] || `// Default code unavailable.`;
        editorState = createEditorState(initialCode, initialLanguage);
        editorContainerElement.innerHTML = ''; // Clear container
        editorView = new EditorView({ state: editorState, parent: editorContainerElement });
        console.log("CodeMirror initialized.");

        // Language Switching Logic
        languageSelectElement.addEventListener('change', (event) => {
            const newLanguage = event.target.value;
            console.log(`Language changed to: ${newLanguage}`);
            let newDoc = editorView?.state.doc.toString() || '';
             if(confirm(`Switch language to ${newLanguage}? OK to load default, Cancel to keep current code.`)) {
                 newDoc = loadedProblemData?.defaultCode?.[newLanguage] || `// Default code unavailable.`;
             }
            if (editorView) {
                editorState = createEditorState(newDoc, newLanguage);
                editorView.setState(editorState);
                console.log("CodeMirror state updated for new language.");
            } else { console.error("Cannot update language - editorView not found."); }
            resultOutputElement.textContent = 'Submit your code...'; resultOutputElement.className = '';
        });

        // Enable Controls and Add Submit Listener
        languageSelectElement.disabled = false;
        submitBtn.disabled = false;
        submitBtn.replaceWith(submitBtn.cloneNode(true)); // Remove old listeners
        document.getElementById('submit-btn').addEventListener('click', () => handleSubmit(problemId));
        console.log("Problem details loaded and page setup complete.");

    } catch (error) {
        console.error(`Failed to load problem details for ID ${problemId}:`, error);
        titleElement.textContent = "Error Loading Problem";
        descriptionElement.textContent = `Failed to load problem details: ${error.message}`;
        if (examplesElement) examplesElement.innerHTML = '';
        if (editorContainerElement && !editorView) editorContainerElement.textContent = `// Error: ${error.message}`;
        languageSelectElement.disabled = true; submitBtn.disabled = true;
    }
}

// --- Handle Code Submission (Modified for CodeMirror) ---
async function handleSubmit(problemId) {
    console.log(`Handling submission for problem ID: ${problemId}`);
    if (!editorView) { console.error("FATAL: CodeMirror editor instance not found."); /* ... error display ... */ return; }
    const userCode = editorView.state.doc.toString();
    const submitBtn = document.getElementById('submit-btn');
    const resultOutputElement = document.getElementById('result-output');
    const languageSelectElement = document.getElementById('language-select');

    if (!submitBtn || !resultOutputElement || !languageSelectElement || !problemId) { console.error("FATAL: Missing elements required for submission."); /* ... error display ... */ return; }

    const language = languageSelectElement.value;
    if (!userCode.trim()) { resultOutputElement.textContent = 'Cannot submit empty code.'; resultOutputElement.className = 'status-Error'; return; }

    console.log(`Submitting code for language: ${language}...`);
    resultOutputElement.textContent = 'Running submission... Please wait.'; resultOutputElement.className = '';
    submitBtn.disabled = true; languageSelectElement.disabled = true;
    // Disable editor
    editorView.dispatch({ effects: StateEffect.reconfigure.of(EditorView.editable.of(false)) });

    try {
        const response = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problemId, language, code: userCode, }) });
        const result = await response.json();
        console.log("Submission result from API:", result);
        if (!response.ok) { throw new Error(result.output || result.error || `Server error: ${response.statusText} (${response.status})`); }

        // Display Result
        const status = result.status || 'Unknown Status';
        const output = result.output !== undefined ? String(result.output) : 'No output received.';
        resultOutputElement.textContent = `Status: ${status}\n\nOutput:\n${output}`;
        resultOutputElement.className = `status-${status.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;
    } catch (error) {
        console.error("Submission failed:", error);
        resultOutputElement.textContent = `Submission Error: ${error.message}`; resultOutputElement.className = 'status-Error';
    } finally {
        // Restore UI State
        submitBtn.disabled = false; languageSelectElement.disabled = false;
        // Re-enable editor
        if (editorView) { editorView.dispatch({ effects: StateEffect.reconfigure.of(EditorView.editable.of(true)) }); }
        console.log("Submission process finished.");
    }
}


// --- Determine which function to call based on page ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded.");
    if (document.getElementById('problem-list')) {
        console.log("Detected problem list page. Calling loadProblemList.");
        loadProblemList();
    } else if (document.getElementById('code-editor-container')) {
         console.log("Detected problem detail page. Calling loadProblemDetails.");
         loadProblemDetails();
    } else if (document.getElementById('problem-count-info')) {
         console.log("Detected homepage. Initializing homepage elements (if any).");
         // Problem count is handled by inline script in index.html
    } else {
        console.log("On a page without specific list/detail loading logic.");
    }
});