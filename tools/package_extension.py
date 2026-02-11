import os
import zipfile

def create_extension_zip(output_filename="extension.zip"):
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
        "README.md"
    ]

    # Determine the project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    # Switch to project root
    os.chdir(project_root)

    # Initialize zip file
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for path in include_paths:
            if os.path.isfile(path):
                zipf.write(path)
            elif os.path.isdir(path):
                for root, dirs, files in os.walk(path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # Exclude hidden files like .DS_Store
                        if file == ".DS_Store":
                            continue
                        zipf.write(file_path)
    
    # Move zip file back to script directory if desired, or keep in root. keeping in root is better
    print(f"Extension packaged successfully into {os.path.abspath(output_filename)}")

if __name__ == "__main__":
    create_extension_zip()
