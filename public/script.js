// script.js - Frontend Logic

// --- Helper Function to Get Problem ID from URL ---
function getProblemIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// --- Function to Load Problem List (for index.html) ---
async function loadProblemList() {
    const problemListElement = document.getElementById('problem-list');
    if (!problemListElement) return; // Only run on index.html

    try {
        const response = await fetch('/api/problems');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const problems = await response.json();

        problemListElement.innerHTML = '';
        if (problems.length === 0) {
             problemListElement.innerHTML = '<li>No problems available.</li>';
             return;
        }

        problems.forEach(problem => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = `problem.html?id=${problem.id}`;
            link.textContent = problem.title;
            li.appendChild(link);
            problemListElement.appendChild(li);
        });

    } catch (error) {
        problemListElement.innerHTML = `<li>Error loading problems: ${error.message}</li>`;
        console.error("Failed to load problems:", error);
    }
}


// --- Function to Load Problem Details (for problem.html) ---
async function loadProblemDetails() {
    const problemId = getProblemIdFromUrl();
    const titleElement = document.getElementById('problem-title');
    const descriptionElement = document.getElementById('problem-description');
    const examplesElement = document.getElementById('problem-examples');
    const codeEditorElement = document.getElementById('code-editor');
    const submitBtn = document.getElementById('submit-btn');
    const resultOutputElement = document.getElementById('result-output');
    const languageSelectElement = document.getElementById('language-select'); // Get the language dropdown

    // Check if we are on the problem page by seeing if essential elements exist
    if (!titleElement || !problemId || !languageSelectElement || !codeEditorElement || !resultOutputElement) {
        console.error("Missing essential elements on the problem page.");
        // Optionally display an error message to the user on the page
        if (titleElement) titleElement.textContent = "Error";
        if (descriptionElement) descriptionElement.textContent = "Page structure error. Required elements missing.";
        return;
    }

    let loadedProblemData = null; // Variable to store the fetched problem data

    try {
        const response = await fetch(`/api/problems/${problemId}`);
        if (!response.ok) {
             if (response.status === 404) throw new Error('Problem not found.');
             throw new Error(`HTTP error! status: ${response.status}`);
        }
        const problem = await response.json();
        loadedProblemData = problem; // Store the data for later use (in the event listener)

        // Fill the page elements
        titleElement.textContent = problem.title;
        document.title = `DCD - ${problem.title}`;
        descriptionElement.textContent = problem.description;

        examplesElement.innerHTML = '';
        if (problem.examples && Array.isArray(problem.examples)) {
            problem.examples.forEach(ex => {
                const div = document.createElement('div');
                // Safer approach using textContent and template literals if needed
                const inputContent = ex.input ?? 'N/A';
                const outputContent = ex.output ?? 'N/A';
                div.innerHTML = `<p><strong>Input:</strong> <code>${inputContent}</code></p><p><strong>Output:</strong> <code>${outputContent}</code></p>`;
                examplesElement.appendChild(div);
            });
        } else {
             examplesElement.innerHTML = '<p>No examples provided.</p>';
        }


        // --- *** NEW: Helper Function to Update Editor *** ---
        const updateEditorForLanguage = (selectedLanguage) => {
            // Make sure we have the problem data loaded
            if (!loadedProblemData) {
                console.warn("Problem data not loaded yet, cannot update editor.");
                return;
            }

            let defaultCode = `// Write your ${selectedLanguage} code here...\n// Default code not available for this language.`; // Default fallback

            // Check if defaultCode exists and has an entry for the selected language
            if (loadedProblemData.defaultCode && typeof loadedProblemData.defaultCode === 'object' && loadedProblemData.defaultCode[selectedLanguage]) {
                 defaultCode = loadedProblemData.defaultCode[selectedLanguage];
            }

             // Update the code editor's content
             codeEditorElement.value = defaultCode;

             // Optional: Clear the result output when the language changes
             resultOutputElement.textContent = 'Submit your code to see the result.';
             resultOutputElement.className = ''; // Clear any status styling
        };
        // --- *** END of Helper Function *** ---


        // --- *** MODIFIED: Set Initial Code and Add Listener *** ---
        // Set the initial code based on the default selected language in HTML
        updateEditorForLanguage(languageSelectElement.value);

        // Add the event listener to the language dropdown
        languageSelectElement.addEventListener('change', (event) => {
            const newlySelectedLanguage = event.target.value; // Get the value ('javascript', 'python', etc.)
            updateEditorForLanguage(newlySelectedLanguage); // Call the helper function
        });
        // --- *** END of Modification *** ---


        // Add event listener to the submit button (ensure button exists)
         if (submitBtn) {
            submitBtn.addEventListener('click', () => handleSubmit(problemId));
            submitBtn.disabled = false; // Ensure button is enabled if loading succeeds
         } else {
             console.warn("Submit button not found.");
         }
         languageSelectElement.disabled = false; // Ensure dropdown is enabled

    } catch (error) {
        titleElement.textContent = "Error";
        document.title = "Daily Coding Dose - Error";
        descriptionElement.textContent = `Failed to load problem: ${error.message}`;
        console.error("Failed to load problem details:", error);
         // Disable controls on error
         if (submitBtn) submitBtn.disabled = true;
         languageSelectElement.disabled = true;
         codeEditorElement.value = `// Error loading problem details: ${error.message}`;
         codeEditorElement.disabled = true;
    }
}

// --- Function to Handle Code Submission ---
async function handleSubmit(problemId) {
    const codeEditorElement = document.getElementById('code-editor');
    const submitBtn = document.getElementById('submit-btn');
    const resultOutputElement = document.getElementById('result-output');
    const languageSelectElement = document.getElementById('language-select');

    // Add languageSelectElement to the check
    if (!codeEditorElement || !submitBtn || !resultOutputElement || !languageSelectElement || !problemId) {
         console.error("Missing elements for submission.");
         if (resultOutputElement) resultOutputElement.textContent = "Error: Page elements missing. Cannot submit.";
         return;
    }

    const userCode = codeEditorElement.value;
    const language = languageSelectElement.value; // Get the *currently* selected language

    // Show loading state
    resultOutputElement.textContent = 'Running submission...';
    resultOutputElement.className = '';
    submitBtn.disabled = true;
    languageSelectElement.disabled = true; // Also disable dropdown during submission

    try {
        const response = await fetch('/api/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                problemId: problemId,
                language: language, // Send the selected language
                code: userCode,
            }),
        });

        const result = await response.json();

         if (!response.ok) {
            throw new Error(result.output || `Server error: ${response.statusText} (${response.status})`);
        }

        // Display result
        resultOutputElement.textContent = `Status: ${result.status}\n\nOutput:\n${result.output}`;
        resultOutputElement.className = `status-${result.status.replace(/\s+/g, '_')}`;


    } catch (error) {
        resultOutputElement.textContent = `Submission Error: ${error.message}`;
         resultOutputElement.className = 'status-Error';
        console.error("Submission failed:", error);
    } finally {
        // Re-enable controls
        submitBtn.disabled = false;
        languageSelectElement.disabled = false;
    }
}

// Note: The call loadProblemDetails() should still be in problem.html
// inside a <script> tag, like you already have.