import sys, lzma, os, mmap
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
f=open(src,"rb"); m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
offs=[]; i=0
while (i:=m.find(b"zlb\x1a", i))!=-1: offs.append(i); i+=4
print("chunks:", len(offs), "file size", len(m), "first", offs[:5])
tot=0
for n,o in enumerate(offs):
    end = offs[n+1] if n+1<len(offs) else len(m)
    raw = m[o+4:end]
    data=None
    for mode in ("lzma2","lzma1"):
        try:
            if mode=="lzma2":
                ds=raw[0]; dict_size = 0xFFFFFFFF if ds==40 else (2|(ds&1))<<(ds//2+11)
                d=lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[{"id":lzma.FILTER_LZMA2,"dict_size":dict_size}]); body=raw[1:]
            else:
                p=raw[0]; lc=p%9; lp=(p//9)%5; pb=p//45; dict_size=int.from_bytes(raw[1:5],"little")
                d=lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[{"id":lzma.FILTER_LZMA1,"dict_size":dict_size,"lc":lc,"lp":lp,"pb":pb}]); body=raw[5:]
            parts=[]; pos=0; B=1<<22
            try:
                while pos<len(body) and not d.eof:
                    parts.append(d.decompress(body[pos:pos+B])); pos+=B
            except lzma.LZMAError as e:
                if sum(map(len,parts))<1000: raise
            data=b"".join(parts)
            if len(data)>100: break
        except Exception as e:
            data=None
    if data:
        tot+=len(data); open(os.path.join(out,f"chunk{n:03d}.bin"),"wb").write(data)
        print(n, hex(o), mode, len(raw), "->", len(data), data[:4])
    else: print(n, hex(o), "failed", bytes(raw[:8]).hex())
print("total", tot)
