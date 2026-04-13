<?php
// /usr/local/lib/phpless-ls.php — List directory contents as JSON.
// Used by the panel's file browser to read the live VM filesystem.
$dir = $argv[1] ?? '/app';
if (!is_dir($dir)) { echo '[]'; exit; }
$items = [];
foreach (scandir($dir) as $f) {
    if ($f === '.' || $f === '..') continue;
    $full = $dir . '/' . $f;
    $s = @stat($full);
    $items[] = [
        'name' => $f,
        'type' => is_dir($full) ? 'dir' : 'file',
        'size' => $s ? $s['size'] : 0,
        'mtime' => $s ? $s['mtime'] : 0,
    ];
}
echo json_encode($items);
