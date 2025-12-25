
import os

def migrate_settings_robust():
    file_path = r"d:\codeproject\web\multi-stream\js\settings.js"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    
    # We found that `/* */` comments break if nested.
    # So we will use `// ` for every line in the target ranges.
    
    # The previous script might have added some `/*` and `*/` markers.
    # We should clean them up if they exist, or just comment everything out.
    
    # Let's redefine the ranges based on the content signatures, 
    # because line numbers might have shifted slightly due to previous script's insertions (if any).
    # But wait, the previous script DID run, so there are existing `/*` and `*/` lines now.
    
    # Block A start: `function selectAllFavorites() {`
    # Block A end: `async function addCurrentStreamToFavorites() {` ... end of that function.
    # Let's be safer: comment out everything from `function selectAllFavorites()` 
    # to the line before `setTimeout(() => { saveUserSettings(); }, 1000);` in `autoSaveSettings`? No autoSaveSettings is kept.
    # `addCurrentStreamToFavorites` ends around line 2143.
    
    # Let's locate the indices dynamically to be safe.
    
    start_a_idx = -1
    end_a_idx = -1
    
    start_b_idx = -1
    end_b_idx = -1
    
    for i, line in enumerate(lines):
        if "function selectAllFavorites() {" in line and start_a_idx == -1:
            start_a_idx = i
        
        # We need to find the end of `addCurrentStreamToFavorites`.
        # It is followed by `function autoSaveSettings() {`
        if "function autoSaveSettings() {" in line:
            end_a_idx = i - 1
            
        if "function initFavoriteSearchSuggestions() {" in line and start_b_idx == -1:
            start_b_idx = i
            
        # We need to find the end of Search UI.
        # It goes until the exports or end of file.
        # It seems `requestAnimationFrame` or `updateBackupSettingsDisplay` might be after it?
        # No, `updateBackupSettingsDisplay` is at line 500.
        # The search UI is near the end.
        # It is followed by `if (typeof window !== 'undefined') {` (Exports)
        if "if (typeof window !== 'undefined') {" in line and i > 2000: # Ensure it's the one at the end
            end_b_idx = i - 1
            
    # If indices found, proceed.
    # Adjust for safety (maybe include the previous line if it's a comment we added)
    
    # Actually, since the file is messy with potential half-comments, 
    # let's just use strict line ranges roughly, or better yet, verify content.
    
    # Previous script insertion logic:
    # `/* [MIGRATED] ... */` was added BEFORE `selectAllFavorites` (maybe).
    
    # Let's just walk through and comment out lines that are inside the logic blocks we want to remove.
    # We will use a state machine approach.
    
    in_block_a = False
    in_block_b = False
    
    final_lines = []
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Detect start of Block A
        if "function selectAllFavorites() {" in line:
            in_block_a = True
            final_lines.append("// [MIGRATED] START BLOCK A\n")
            
        # Detect end of Block A (Start of autoSaveSettings)
        if in_block_a and "function autoSaveSettings() {" in line:
            in_block_a = False
            final_lines.append("// [MIGRATED] END BLOCK A\n")
            
        # Detect start of Block B
        if "function initFavoriteSearchSuggestions() {" in line:
            in_block_b = True
            final_lines.append("// [MIGRATED] START BLOCK B\n")
            
        # Detect end of Block B (Start of exports block)
        if in_block_b and "if (typeof window !== 'undefined') {" in line:
            in_block_b = False
            final_lines.append("// [MIGRATED] END BLOCK B\n")

        # Processing
        if in_block_a or in_block_b:
            # If line is already commented with //, leave it (or double comment?)
            # Valid code might have // comments. 
            # We want to disable the code.
            # If line starts with "/*" or "*/" from previous fail, we comment it out too.
            final_lines.append("// " + line)
        else:
            final_lines.append(line)
            
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(final_lines)

if __name__ == "__main__":
    migrate_settings_robust()
