"""Splash .mhtml (Chrome "Webpage, Single File") -> the page HTML. Usage: extract.py in.mhtml out.html"""
import email, sys, re, html
from email import policy
msg = email.message_from_binary_file(open(sys.argv[1],'rb'), policy=policy.default)
for part in msg.walk():
    if part.get_content_type()=="text/html":
        h = part.get_content()
        open(sys.argv[2],"w").write(h)
        break
