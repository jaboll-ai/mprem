import os

def join(path, *paths):
    # Simple implementation of os.path.join
    for p in paths:
        if p.startswith('/'):
            path = p
        elif path == '' or path.endswith('/'):
            path += p
        else:
            path += '/' + p
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

# Example usage:
for root, dirs, files in walk("/"):
    for file in files:
        print(join(root, file))
