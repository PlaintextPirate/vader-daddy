import sys
def decode(data: bytes) -> bytes:
    b=bytearray(data); n=len(b); i=0; BS=0x10000
    while i<n:
        c=b[i]; i+=1
        if c!=0xE8 and c!=0xE9: continue
        if BS-((i-1)%BS) < 5: continue
        if i+4>n: break
        if b[i+3] in (0x00,0xFF):
            addr=(i+4)&0xFFFFFF
            rel=(b[i]|b[i+1]<<8|b[i+2]<<16)
            rel=(rel-addr)&0xFFFFFF
            b[i]=rel&0xFF; b[i+1]=(rel>>8)&0xFF; b[i+2]=(rel>>16)&0xFF
            if rel&0x800000: b[i+3]^=0xFF
        i+=4
    return bytes(b)
if __name__=="__main__":
    open(sys.argv[2],"wb").write(decode(open(sys.argv[1],"rb").read()))
