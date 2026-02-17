import json
import os
import zipfile

def create_extension_zip():
    # Files and directories to include
    include_paths = [
        "manifest.json",
        "_locales",
        "background",
        "content",
        "icons",
        "options",
        "popup",
        "services",
        "styles",
        "utils",
        "LICENSE",
        "PRIVACY.md"
    ]

    # Excluded file patterns
    exclude_suffixes = (".test.js", ".map", ".DS_Store")

    # Determine the project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    # Switch to project root
    os.chdir(project_root)

    # Read version from manifest.json
    with open("manifest.json", "r", encoding="utf-8") as f:
        manifest = json.load(f)
    version = manifest.get("version", "0.0.0")

    # Output to devtools/ directory with version in filename
    output_filename = os.path.join(script_dir, f"ankibeam-v{version}.zip")

    # Initialize zip file
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for path in include_paths:
            if os.path.isfile(path):
                zipf.write(path)
            elif os.path.isdir(path):
                for root, dirs, files in os.walk(path):
                    for file in files:
                        if file.endswith(exclude_suffixes):
                            continue
                        # styles/ directory: only include .css files
                        if path == "styles" and not file.endswith(".css"):
                            continue
                        file_path = os.path.join(root, file)
                        zipf.write(file_path)

    print(f"Extension packaged successfully into {os.path.abspath(output_filename)}")

if __name__ == "__main__":
    create_extension_zip()
