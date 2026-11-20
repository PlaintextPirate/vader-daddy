import sys, mmap, struct, os
sys.path.insert(0, sys.argv[3])
from unbcj import decode
import dnfile
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
KEYS=(b"SwitchConfig",b"SleepTime",b"DInput",b"Calibration",b"GamePad",b"Gamepad")
i=0; seen=set()
while (i:=m.find(b"MZ\x90\x00",i))!=-1:
    r=pe_at(i)
    if r and r[1] and r[0]<80_000_000:
        seg=m[i:i+r[0]]
        k=[x.decode() for x in KEYS if x in seg]
        if len(k)>=2:
            d=decode(seg)
            try:
                pe=dnfile.dnPE(data=d); nm=str(pe.net.mdtables.Module.rows[0].Name); ver=pe.net.mdtables.Assembly.rows[0]; v=f"{ver.MajorVersion}.{ver.MinorVersion}.{ver.BuildNumber}.{ver.RevisionNumber}"
            except Exception as e: nm="unk_%x"%i; v="?"
            tag=(nm,len(d))
            print(hex(i), r[0], nm, v, k, "dup" if tag in seen else "")
            if tag not in seen:
                seen.add(tag); open(os.path.join(sys.argv[2],nm),"wb").write(d)
        i+=r[0] if False else 4
    else: i+=4
