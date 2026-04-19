# Multi-Danmaku File Loading Feature Requirements

## Feature Overview
Support loading multiple danmaku files for the same video. Users can manually select and switch danmaku files in the sidebar. Multiple danmaku files can be displayed simultaneously with automatic deduplication.

## Core Requirements

### 1. Danmaku File Discovery and Matching
- **Use `file.list()` API** to list all files in the danmaku directory
  - No need to recursively search subdirectories (`includeSubDir: false`)
- **File type filtering**: Only process `.json` and `.xml` file types
- **Episode number matching algorithm**:
  - Use the same regex logic as `extractEpisodeNumber()` to extract episode numbers from danmaku filenames
  - Support multiple episode number formats:
    - `[number]` format (e.g., `[01].xml`)
    - `number` standalone format (e.g., `01.xml`)
    - `第number话` format (e.g., `第1话.xml`)
    - `Episode number` format (e.g., `Episode01.xml`)

### 2. Sidebar Multi-Select UI
- **Display danmaku file list** (Three separate lists, displayed top to bottom):
  - **Matched XML danmaku file list**:
    - List all XML files matching the current video episode number
    - Display filename, file type (XML)
    - Display relative file path
  - **Matched JSON danmaku file list**:
    - List all JSON files matching the current video episode number
    - Display filename, file type (JSON)
    - Display relative file path
  - **Unrecognized episode danmaku file list** (Unknown list):
    - List xml/json files in the danmaku folder that cannot recognize episode numbers
    - Display filename, file type (JSON/XML)
    - Display relative file path
    - **Default hidden**, click to expand and display
- **Multi-select functionality**:
  - Use checkboxes to support multi-select
  - Users can check multiple danmaku files
  - Default selection: first matched danmaku file (XML or JSON)
  - **Debounce required**: Prevent users from quickly checking multiple files
- **Add/Delete functionality**:
  - **Add button**: Allow users to select new danmaku files to add to the list
    - Added files are directly added to matched episode list
    - Default selected when added
  - **Delete button**: Remove danmaku files from the list
    - Also remove from overlay if the file is already loaded
    - No confirmation dialog needed
  - Added files can come from any location
- **Real-time feedback**:
  - Display current number of selected danmaku files
  - Display total danmaku count (after merging and deduplication)
  - **Error handling**: Show error message when file read fails

### 3. Multi-File Merged Loading
- **Send to overlay**:
  - Send all user-selected danmaku file contents to overlay
  - Each file is read independently and converted to hex format
- **Merge logic**:
  - Merge multiple danmaku files in overlay
  - Sort by timestamp for display
- **Dynamic switching**:
  - Real-time update of danmaku in overlay when user checks/unchecks
  - **When unchecking**: Only remove that file's danmaku, don't reload all files
  - No need to reload the video

### 4. Danmaku Deduplication
- **Deduplication identifier**: `Send time + Danmaku content`
- **Deduplication timing**: When merging multiple danmaku files in overlay
- **Deduplication reason**:
  - Different danmaku files may be exported at different times
  - The same danmaku may exist in multiple files
- **Implementation method**:
  - Use Set or Map to store unique identifiers of seen danmaku
  - Skip when encountering duplicate identifiers while traversing all danmaku

## Technical Implementation Details

### main.js
1. Add `extractDanmakuNumber()` function
   - Reuse regex logic from `extractEpisodeNumber()`

2. Add `findDanmakuByEpisode()` function
   - Use `file.list()` to list directory files
   - Filter `.json` and `.xml` files
   - Call `extractDanmakuNumber()` to extract episode numbers and match
   - **Return two types of file lists**:
     - Matched episode file list
     - Unmatched episode file list (all xml/json files in danmaku folder)

3. Modify `loadDanmakuForVideo()` function
   - Call `findDanmakuByEpisode()` to get danmaku file list
   - Send file list to sidebar
   - **Default load only the first danmaku file to overlay** (on-demand loading, not loading all files at once)

4. Add message handling
   - Receive user selection messages from sidebar
   - Read newly selected danmaku files and send to overlay
   - Support incremental loading (load corresponding danmaku file only when user checks)
   - Receive add file messages from sidebar, update file list
   - Receive delete file messages from sidebar, update file list

### sidebar/index.js
1. Add danmaku file list UI
   - Checkbox list displaying all danmaku files (matched and unmatched episodes)
   - Display filename, type, path and other information
   - Identify which files matched episodes and which did not

2. Add message handling
   - Receive danmaku file list sent from main.js
   - Send user selection to main.js

3. Add/Delete functionality
   - **Add button**: Call file selection dialog to select new danmaku files to add to the list
   - **Delete button**: Remove selected danmaku files from the list
   - Send add/delete messages to main.js to update file list

### overlay/main.js
1. Modify danmaku loading logic
   - Support receiving multiple danmaku files
   - Merge all danmaku and sort by time

2. Implement deduplication logic
   - Use `Send time + Content` as unique identifier
   - Automatically deduplicate when merging

## Data Flow

### Initial Loading Flow
```
Video loaded
  ↓
main.js: Extract video episode number
  ↓
main.js: file.list() to get danmaku directory files
  ↓
main.js: Filter and match danmaku files
  ↓
main.js: Send file list to sidebar
  ↓
main.js: Default load first danmaku file to overlay
  ↓
sidebar: Display file list, first one selected by default
  ↓
overlay: Display danmaku
```

### User Selects Other Danmaku Files Flow
```
User checks/unchecks danmaku files in sidebar
  ↓
sidebar: Send user selection to main.js
  ↓
main.js: Read newly selected danmaku files
  ↓
main.js: Send danmaku content to overlay
  ↓
overlay: Merge danmaku and deduplicate
  ↓
overlay: Update display
```

### Add Danmaku File Flow
```
User clicks add button in sidebar
  ↓
sidebar: Call file selection dialog
  ↓
User selects new danmaku file
  ↓
sidebar: Send add message to main.js
  ↓
main.js: Update file list
  ↓
main.js: Send updated file list to sidebar
  ↓
sidebar: Update display
```

### Delete Danmaku File Flow
```
User selects file and clicks delete button in sidebar
  ↓
sidebar: Send delete message to main.js
  ↓
main.js: Update file list
  ↓
main.js: Send updated file list to sidebar
  ↓
sidebar: Update display
```

## Confirmed Items
- [x] Default selection strategy: Default select first danmaku file
- [x] Danmaku file list sorting rule: First by type (.json priority or .xml priority), then by filename
- [x] No need to remember user selection (re-select each time video is opened)
- [x] No need to support select all/deselect all buttons
- [x] Danmaku file list UI design: Beautiful and concise
- [x] Display unmatched episode danmaku files (all xml/json files in danmaku folder)
- [x] Support add danmaku file functionality (select files from any location to add to list)
- [x] Support delete danmaku file functionality (remove files from list)

## Implementation Priority
1. **P0 - Core Features**
   - file.list() to discover danmaku files
   - Episode number matching algorithm
   - Display unmatched episode danmaku files
   
2. **P1 - Basic UI**
   - Sidebar danmaku file list display
   - Checkbox multi-select functionality
   - Add/delete danmaku file functionality
   
3. **P2 - Advanced Features**
   - Multi-file merged loading
   - Danmaku deduplication
   - Dynamic switching

## Notes
- IINA file API limitation: `file.list()` only returns `{ filename, path, isDir }`, no file size, modification time or other attributes
- **On-demand loading strategy**: Default load only first danmaku file, load other files when user checks to avoid performance impact from loading all files at once
- Performance consideration: Reading multiple danmaku files may affect loading speed, needs optimization
- User experience: Danmaku file list should be clear and easy to understand, avoid confusion
- **Add file**: Added files can come from any location, need to maintain complete file path
- **Delete file**: Delete only removes from list, does not delete actual file
- **Rendering engine limitation**: Multi-danmaku merge feature only supports CSS rendering mode, Canvas mode (niconicocomments) does not support multi-danmaku merge
