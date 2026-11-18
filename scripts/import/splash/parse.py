"""Splash "Picks by Week" HTML -> table rows as JSON (one list of cell texts per row). Usage: parse.py in.html out.json"""
import sys
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.rows=[]; s.row=None; s.cell=None; s.skip=0; s.head=[]
    def handle_starttag(s,t,a):
        if t in("script","style"): s.skip+=1
        if t=="tr": s.row=[]
        if t in("td","th") and s.row is not None: s.cell=[]
        if t=="img" and s.cell is not None:
            d=dict(a); 
            if d.get("alt"): s.cell.append("[img:"+d["alt"]+"]")
    def handle_endtag(s,t):
        if t in("script","style"): s.skip-=1
        if t in("td","th") and s.cell is not None and s.row is not None:
            s.row.append(" | ".join(x for x in s.cell if x)); s.cell=None
        if t=="tr" and s.row is not None:
            s.rows.append(s.row); s.row=None
    def handle_data(s,d):
        if s.skip: return
        d=d.strip()
        if d and s.cell is not None: s.cell.append(d)
p=P(); p.feed(open(sys.argv[1]).read())
import json; json.dump(p.rows,open(sys.argv[2],"w"))
print(len(p.rows)); 
for r in p.rows[:4]: print(len(r), r[:6])
