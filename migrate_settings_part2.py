
import os

def migrate_settings():
    file_path = r"d:\codeproject\web\multi-stream\js\settings.js"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    
    # Ranges to comment out (1-based index from analysis, converted to 0-based)
    # Block A: 1324 to 2143 (selectAllFavorites ... addCurrentStreamToFavorites)
    # Block B: 2645 to 2932 (Search UI)
    
    # We need to map 1-based line numbers to list indices carefully.
    # Line 1 in editor = index 0.
    
    start_a = 1324 - 1
    end_a = 2143 - 1
    
    start_b = 2645 - 1
    end_b = 2932 - 1
    
    # Also exports at the end: 2939-2944
    # But checking exact lines for exports is safer by content.
    
    for i, line in enumerate(lines):
        # Block A
        if i == start_a:
            new_lines.append("/* [MIGRATED] Legacy UI functions (Selection, Loading, Live Status, Add Current) moved/obsolete */\n")
            new_lines.append("/*\n")
            new_lines.append(line)
        elif i == end_a:
            new_lines.append(line)
            new_lines.append("*/\n")
        
        # Block B
        elif i == start_b:
            new_lines.append("/* [MIGRATED] Legacy Search UI moved/obsolete */\n")
            new_lines.append("/*\n")
            new_lines.append(line)
        elif i == end_b:
            new_lines.append(line)
            new_lines.append("*/\n")
            
        # Inside blocks
        elif (start_a < i < end_a) or (start_b < i < end_b):
            new_lines.append(line)
            
        # Exports
        elif "window.addCurrentStreamToFavorites =" in line or \
             "window.refreshFavoriteStatus =" in line or \
             "window.updateFavoriteListDisplay =" in line or \
             "window.updateFavoriteLiveStatuses =" in line or \
             "window.startFavoriteLiveStatusAutoRefresh =" in line or \
             "window.stopFavoriteLiveStatusAutoRefresh =" in line:
             new_lines.append("// " + line)
             
        else:
            new_lines.append(line)
            
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

if __name__ == "__main__":
    migrate_settings()
