import sys,re
pat=re.compile(sys.argv[2])
name=None;buf=[];res={}
def val(l):
    op=l[1]; a=' '.join(l[2:])
    if op.startswith('ldc.i4'):
        m=re.match(r'ldc\.i4\.(\d)$',op)
        if op=='ldc.i4.m1': return 'FF'
        n=int(m.group(1)) if m else int(a,0)
        return '%02X'%(n&0xff) if -129<n<256 else hex(n)
    if op.startswith('ldarg'): return ''
    if op.startswith('ldloc'): return ''
    if op in('conv.u1','dup','nop','ldelem.u1'): return '[]' if op=='ldelem.u1' else ''
    if op in ('ldsfld','ldfld','call','callvirt'): return a.split('::')[-1].replace('get_','').replace('<','').replace('>P','')
    return op
def flush():
    if not name or not pat.search(name): return
    cls,meth=name.rsplit('::',1)
    if meth=='CommandId':
        res.setdefault(cls,{})['id']=' '.join(v for v in map(val,buf) if v and v!='ret')
    elif meth=='CreateCommand':
        out=[]
        for j,l in enumerate(buf):
            if l[1].startswith('stelem'):
                k=j-1;t=[]
                while k>=0 and not (buf[k][1].startswith('stelem') or buf[k][1].startswith('stloc') or re.match(r'b[rlg]',buf[k][1])):
                    t.append(val(buf[k]));k-=1
                t=[x for x in reversed(t) if x]
                out.append('[%s]=%s'%(t[0] if t else '?',' '.join(t[1:])))
        res.setdefault(cls,{})['cmd']='  '.join(out)
for line in open(sys.argv[1]):
    if line.startswith('==='):
        flush(); name=line.strip('= \n'); buf=[]
    else:
        p=line.split()
        if len(p)>=2: buf.append(p)
flush()
for c in sorted(res): print('%-52s id=%-6s %s'%(c.lstrip('.'),res[c].get('id','?'),res[c].get('cmd','')))
