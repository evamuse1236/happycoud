"""Compile the actual exported production shaders on Mesa EGL/OpenGL ES 3.
Requires Linux libEGL, Node, Python stdlib. This is NOT a browser WebGL test.
"""
from pathlib import Path
import ctypes as C, os, subprocess, json
os.environ.setdefault('EGL_PLATFORM','surfaceless')
root=Path(__file__).resolve().parents[1]
e=C.CDLL('libEGL.so.1');I=C.c_int;U=C.c_uint;P=C.c_void_p
for name,result,args in [('eglGetDisplay',P,[P]),('eglInitialize',I,[P,C.POINTER(I),C.POINTER(I)]),('eglBindAPI',I,[I]),('eglChooseConfig',I,[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)]),('eglCreatePbufferSurface',P,[P,P,C.POINTER(I)]),('eglCreateContext',P,[P,P,P,C.POINTER(I)]),('eglMakeCurrent',I,[P,P,P,P]),('eglGetError',I,[]),('eglGetProcAddress',P,[C.c_char_p]),('eglTerminate',I,[P])]:
 f=getattr(e,name);f.restype=result;f.argtypes=args
D=e.eglGetDisplay(None);major=I();minor=I();assert e.eglInitialize(D,C.byref(major),C.byref(minor));assert e.eglBindAPI(0x30A0)
a=(I*11)(0x3033,1,0x3040,0x0040,0x3024,8,0x3023,8,0x3022,8,0x3038);cfg=P();n=I();assert e.eglChooseConfig(D,a,C.byref(cfg),1,C.byref(n)) and n.value
S=e.eglCreatePbufferSurface(D,cfg,(I*5)(0x3057,8,0x3056,8,0x3038));context=e.eglCreateContext(D,cfg,None,(I*3)(0x3098,3,0x3038));assert e.eglMakeCurrent(D,S,S,context)
def gl(name,result,args):return C.CFUNCTYPE(result,*args)(e.eglGetProcAddress(name.encode()))
create=gl('glCreateShader',U,[U]);source=gl('glShaderSource',None,[U,I,C.POINTER(C.c_char_p),C.POINTER(I)]);compile_=gl('glCompileShader',None,[U]);shaderIV=gl('glGetShaderiv',None,[U,U,C.POINTER(I)]);shaderLog=gl('glGetShaderInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]);delete=gl('glDeleteShader',None,[U]);newProgram=gl('glCreateProgram',U,[]);attach=gl('glAttachShader',None,[U,U]);link=gl('glLinkProgram',None,[U]);programIV=gl('glGetProgramiv',None,[U,U,C.POINTER(I)]);programLog=gl('glGetProgramInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]);deleteProgram=gl('glDeleteProgram',None,[U]);getString=gl('glGetString',C.c_char_p,[U])
shaders=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {shaderSources} from './src/renderer.js';console.log(JSON.stringify(shaderSources))"],cwd=root))
report={'environment':getString(0x1F02).decode(),'renderer':getString(0x1F01).decode(),'scope':'Production shader compilation and program linking on native OpenGL ES; browser GPU integration not exercised.','checks':[]}
for name,pair in shaders.items():
 program=newProgram();stages=[]
 for stage,src in pair.items():
  shader=create(0x8B31 if stage=='vertex' else 0x8B30);raw=src.encode();ptr=C.c_char_p(raw);source(shader,1,C.byref(ptr),None);compile_(shader);status=I();shaderIV(shader,0x8B81,C.byref(status));buf=C.create_string_buffer(8192);shaderLog(shader,8192,None,buf)
  report['checks'].append({'name':name+' '+stage+' compiles','pass':bool(status.value),'log':buf.value.decode()});assert status.value,(name,stage,buf.value)
  attach(program,shader);stages.append(shader)
 link(program);status=I();programIV(program,0x8B82,C.byref(status));buf=C.create_string_buffer(8192);programLog(program,8192,None,buf)
 report['checks'].append({'name':name+' program links','pass':bool(status.value),'log':buf.value.decode()});assert status.value,(name,buf.value)
 for shader in stages:delete(shader)
 deleteProgram(program)
assert gl('glGetError',U,[])()==0
(root/'test-results').mkdir(exist_ok=True);(root/'test-results/shader-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2));e.eglTerminate(D)
