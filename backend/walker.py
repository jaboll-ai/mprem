import os
import sys

def join(path, *paths):
    # Simple implementation of os.path.join
    sep = '/'
    try:
        if os.name == 'nt':  # try overwrite if Windows
            sep = '\\'
    except AttributeError:
        pass
    for p in paths:
        if p.startswith(sep):
            path = p
        elif path == '' or path.endswith(sep):
            path += p
        else:
            path += sep + p
    return path

def walk(top):
    dirs, nondirs = [], []
    try:
        for name in os.listdir(top):
            path = join(top, name)
            if os.stat(path)[0] & 0x4000:  # S_IFDIR (directory)
                dirs.append(name)
            else:
                nondirs.append(name)
    except OSError:
        return
    
    yield top, dirs, nondirs
    
    for name in dirs:
        path = join(top, name)
        for x in walk(path):
            yield x

main_path = "/" if len(sys.argv) < 2 else sys.argv[1]
# Example usage:
for root, dirs, files in walk(main_path):
    print(root)
    for file in files:
        print(join(root, file))