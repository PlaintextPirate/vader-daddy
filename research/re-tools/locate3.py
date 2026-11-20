import sys, mmap, struct, os, re
f=open(sys.argv[1],"rb"); m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
def pe_at(o):
    try:
        e=struct.unpack_from("<I",m,o+0x3c)[0]
        if e>0x1000 or m[o+e:o+e+4]!=b"PE\0\0": return None
        nsec=struct.unpack_from("<H",m,o+e+6)[0]; optsz=struct.unpack_from("<H",m,o+e+20)[0]
        magic=struct.unpack_from("<H",m,o+e+24)[0]; dd=o+e+24+(96 if magic==0x10b else 112)
        clr=struct.unpack_from("<II",m,dd+14*8)
        st=o+e+24+optsz; end=0
        for i in range(nsec):
            rs,rp=struct.unpack_from("<II",m,st+i*40+16); end=max(end,rp+rs)
        return end, clr[0]!=0
    except Exception: return None
i=0; found=[]
while (i:=m.find(b"MZ\x90\x00",i))!=-1:
    r=pe_at(i)
    if r and r[1] and r[0]<60_000_000:
        seg=m[i:i+r[0]]
        if b"Formatter" in seg or b"WriteFull" in seg or b"0\x005\x00E\x00" in seg:
            nm=re.findall(rb"([A-Za-z0-9_.]{3,50}\.(?:dll|exe))\x00", seg)
            hits=sorted(set(x.decode() for x in re.findall(rb"Formatter[A-Za-z0-9_]{3,40}", seg)))
            found.append((i,r[0],nm[-1].decode() if nm else "?",len(hits)))
            open(f"{sys.argv[2]}/{i:x}_{(nm[-1].decode() if nm else 'x')}","wb").write(seg)
    i+=4
for x in found: print(hex(x[0]),x[1],x[2],"Formatter names:",x[3])
