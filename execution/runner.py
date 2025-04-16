# execution/runner.py (Modified for Clean Output)
import sys
import json
import importlib.util
from copy import deepcopy
import os
import traceback

CODE_FILE = '/sandbox/user_code.py'
INPUT_FILE = '/sandbox/input.json'

# Helper to log consistently to stderr
def log_stderr(message):
    print(f"RunnerLog: {message}", file=sys.stderr)

def run_code():
    try:
        # --- Read Input Data ---
        log_stderr("Script started.")
        if not os.path.exists(INPUT_FILE):
            raise FileNotFoundError(f"Input file not found at {INPUT_FILE}")

        with open(INPUT_FILE, 'r', encoding='utf-8') as f: # Specify encoding
            input_raw = f.read()
            log_stderr(f"Read input data: {input_raw}")
            input_data = json.loads(input_raw)

        function_name = input_data.get('functionName')
        input_args = input_data.get('inputArgs')

        if not function_name or not isinstance(input_args, list):
             raise ValueError('Invalid input data format.')
        log_stderr(f"Executing function: {function_name} with args: {input_args!r}") # Use repr for args

        # --- Load User Code ---
        if not os.path.exists(CODE_FILE):
             raise FileNotFoundError(f"Code file not found at {CODE_FILE}")

        module_name = "user_module"
        spec = importlib.util.spec_from_file_location(module_name, os.path.abspath(CODE_FILE))
        if spec is None or spec.loader is None:
             raise ImportError(f"Could not create module spec from code file: {CODE_FILE}")

        user_module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = user_module
        log_stderr("Loading user module...")
        spec.loader.exec_module(user_module)
        log_stderr("User module loaded.")

        if not hasattr(user_module, function_name):
             raise AttributeError(f"Function '{function_name}' not found in user code.")

        user_func = getattr(user_module, function_name)

        # --- Execute User Code ---
        result = None
        args_copy = deepcopy(input_args)
        log_stderr("Executing user function...")

        # Clear stdout buffer before calling user code (just in case)
        sys.stdout.flush()

        if function_name == "reverseString":
             user_func(args_copy[0]) # Modifies args_copy[0] in-place
             result = args_copy[0]   # Result is the modified list
             log_stderr("Executed reverseString (in-place).")
        else:
             result = user_func(*args_copy) # Standard call
             log_stderr("Executed standard function call.")

        # --- Prepare and Output Result ---
        final_output = result
        log_stderr(f"Execution successful. Raw Result: {final_output!r}")

        # --- Write ONLY JSON SUCCESS to STDOUT ---
        success_payload = {"status": "success", "output": final_output}
        success_json = json.dumps(success_payload, ensure_ascii=False)
        # Print ONLY this JSON string to stdout
        print(success_json, file=sys.stdout, flush=True) # Add flush=True here too
        # --- End STDOUT write ---

        log_stderr("Successfully wrote JSON to stdout.")

    except Exception as e:
        # --- Handle Errors ---
        error_type = type(e).__name__
        error_message = str(e)
        log_stderr(f"!!! Runner script error: {error_type}: {error_message}")
        tb_str = traceback.format_exc()
        log_stderr(f"Traceback:\n{tb_str}")

        # --- Write ONLY JSON ERROR to STDERR ---
        error_payload = {
            "status": "error",
            "type": error_type,
            "message": error_message
            # Avoid sending traceback to frontend
        }
        error_json = json.dumps(error_payload, ensure_ascii=False)
        print(error_json, file=sys.stderr, flush=True) # Print error JSON to stderr and flush
        # --- End STDERR write ---
        sys.exit(1) # Exit with non-zero code

    log_stderr("Script finished normally.")
    # No need for extra flushes here if print has flush=True

if __name__ == "__main__":
    run_code()