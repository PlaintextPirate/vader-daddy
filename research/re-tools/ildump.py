import sys, re, dnfile
from dncil.cil.body import CilMethodBody
from dncil.cil.body.reader import CilMethodBodyReaderBase
from dncil.clr.token import Token, StringToken, InvalidToken
from dncil.cil.error import MethodBodyFormatError
class R(CilMethodBodyReaderBase):
    def __init__(s, pe, row): s.pe=pe; s.offset=pe.get_offset_from_rva(row.Rva)
    def read(s,n):
        d=s.pe.get_data(s.pe.get_rva_from_offset(s.offset), n); s.offset+=n; return d
    def tell(s): return s.offset
    def seek(s,o): s.offset=o; return o
pe=dnfile.dnPE(sys.argv[1]); T=pe.net.mdtables
def tname(row):
    return (str(row.TypeNamespace)+"." if getattr(row,"TypeNamespace",None) else "")+str(row.TypeName)
def resolve(op):
    try:
        if isinstance(op, StringToken):
            us=pe.net.user_strings.get(op.rid); return repr(us.value if us else None)
        if isinstance(op, Token):
            t=op.table; rid=op.rid
            if t==6: 
                r=T.MethodDef.rows[rid-1]; return "M:"+owner.get(rid,"?")+"::"+str(r.Name)
            if t==10:
                r=T.MemberRef.rows[rid-1]; c=r.Class.row; return "R:"+(tname(c) if hasattr(c,"TypeName") else "?")+"::"+str(r.Name)
            if t==4: return "F:"+fowner.get(rid,"?")+"::"+str(T.Field.rows[rid-1].Name)
            if t==1: return "T:"+tname(T.TypeRef.rows[rid-1])
            if t==2: return "T:"+tname(T.TypeDef.rows[rid-1])
            return f"tok({t:x},{rid})"
    except Exception as e: return f"?{op!r}"
    return op
owner={}; fowner={}; methods=[]
for td in T.TypeDef.rows:
    for mi in td.MethodList:
        owner[mi.row_index]=tname(td); methods.append((tname(td),mi.row_index,mi.row))
    for fi in td.FieldList: fowner[fi.row_index]=tname(td)
mode=sys.argv[2]; pat=re.compile(sys.argv[3], re.I) if len(sys.argv)>3 else None
if mode=="list":
    for tn,rid,row in methods:
        full=f"{tn}::{row.Name}"
        if not pat or pat.search(full): print(full)
elif mode=="il":
    for tn,rid,row in methods:
        full=f"{tn}::{row.Name}"
        if not pat.search(full) or not row.Rva: continue
        print(f"\n=== {full}")
        try: body=CilMethodBody(R(pe,row))
        except Exception as e: print("  <body error>",e); continue
        for ins in body.instructions:
            op=ins.operand
            if isinstance(op,(Token,StringToken)): op=resolve(op)
            elif op is None: op=""
            print(f"  {ins.offset-body.offset if hasattr(body,'offset') else ins.offset:04x} {ins.opcode.name:<10} {op}")
elif mode=="grepstr":
    for tn,rid,row in methods:
        if not row.Rva: continue
        try: body=CilMethodBody(R(pe,row))
        except Exception: continue
        for ins in body.instructions:
            if isinstance(ins.operand,StringToken):
                s=resolve(ins.operand)
                if pat.search(s): print(f"{tn}::{row.Name}: {s}")
