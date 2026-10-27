using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace TechScope.Desktop {
 internal static class Program {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool SetDllDirectory(string directory);
  [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string className,string title);
  [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")]static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr window,int command);
  internal const string WindowTitle="科技观察 · AI经理研究版 2026.10.27-desktop1";
  internal static string DataRoot,RuntimeRoot,VerificationPath;
  internal static bool ManagerVerificationOnly;
  internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=32*1024*1024,RecursionLimit=128};
  [STAThread]static int Main(string[] args){
   Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   for(int i=0;i<args.Length;i++){if(args[i]=="--verify"&&i+1<args.Length)VerificationPath=Path.GetFullPath(args[++i]);else if(args[i]=="--data-root"&&i+1<args.Length)DataRoot=Path.GetFullPath(args[++i]);else if(args[i]=="--manager-only")ManagerVerificationOnly=true;}
   DesktopInstance instance=null;
   try{
    try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{SetProcessDPIAware();}
    if(DataRoot==null)DataRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"TechScopeDesktop","AIManagerResearch-20261027-desktop1");
    Directory.CreateDirectory(DataRoot);
    instance=new DesktopInstance(DataRoot);
    if(!instance.IsPrimary){if(VerificationPath!=null)return 0;IntPtr existing=FindWindow(null,WindowTitle);if(existing!=IntPtr.Zero){if(IsIconic(existing))ShowWindow(existing,9);SetForegroundWindow(existing);}return 0;}
    RuntimeRoot=ExtractPayload();SetDllDirectory(RuntimeRoot);
    AppDomain.CurrentDomain.AssemblyResolve+=delegate(object sender,ResolveEventArgs e){string name=new AssemblyName(e.Name).Name;if(name=="Microsoft.Web.WebView2.Core"||name=="Microsoft.Web.WebView2.WinForms")return Assembly.LoadFrom(Path.Combine(RuntimeRoot,name+".dll"));return null;};
    return DesktopHost.Run();
   }catch(Exception e){
    var report=new Dictionary<string,object>{{"ok",false},{"error",e.ToString()}};
    if(VerificationPath!=null){Directory.CreateDirectory(Path.GetDirectoryName(VerificationPath));File.WriteAllText(VerificationPath,Json.Serialize(report),Encoding.UTF8);}
    else MessageBox.Show("科技观察暂时无法启动。\n\n"+e.Message+"\n\n如果提示缺少 WebView2，请安装微软 WebView2 运行时后重试。","科技观察",MessageBoxButtons.OK,MessageBoxIcon.Error);
    return 1;
   }finally{if(instance!=null)instance.Dispose();}
  }
  internal static string Hash(byte[] data){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(data)).Replace("-","").ToLowerInvariant();}
  static byte[] Resource(string name){using(Stream s=Assembly.GetExecutingAssembly().GetManifestResourceStream(name)){if(s==null)throw new IOException("内置文件缺失："+name);using(var output=new MemoryStream()){s.CopyTo(output);return output.ToArray();}}}
  static string ExtractPayload(){
   byte[] payload=Resource("TechScope.Payload.zip");string id=Hash(payload).Substring(0,16);
   string folder=Path.Combine(DataRoot,"runtime",id);Directory.CreateDirectory(folder);
   using(var mutex=new Mutex(false,"Local\\TechScope.Extract."+id)){
    bool locked=false;try{try{locked=mutex.WaitOne(TimeSpan.FromSeconds(30));}catch(AbandonedMutexException){locked=true;}if(!locked)throw new IOException("另一个启动过程正在准备界面，请稍后重试。");
     using(var zip=new ZipArchive(new MemoryStream(payload),ZipArchiveMode.Read))foreach(var entry in zip.Entries){
      string target=Path.GetFullPath(Path.Combine(folder,entry.FullName.Replace('/',Path.DirectorySeparatorChar)));
      if(!target.StartsWith(folder+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new IOException("内置文件路径无效");
      if(string.IsNullOrEmpty(entry.Name)){Directory.CreateDirectory(target);continue;}
      Directory.CreateDirectory(Path.GetDirectoryName(target));byte[] bytes;using(var source=entry.Open())using(var memory=new MemoryStream()){source.CopyTo(memory);bytes=memory.ToArray();}
      if(File.Exists(target)&&Hash(File.ReadAllBytes(target))==Hash(bytes))continue;
      string tmp=target+"."+Guid.NewGuid().ToString("N")+".pending";File.WriteAllBytes(tmp,bytes);if(File.Exists(target))File.Replace(tmp,target,null);else File.Move(tmp,target);
     }
    }finally{if(locked)mutex.ReleaseMutex();}
   }
   return folder;
  }
 }
 internal static class DesktopHost {
  [MethodImpl(MethodImplOptions.NoInlining)]internal static int Run(){using(var form=new DesktopForm()){Application.Run(form);return form.ExitStatus;}}
 }
}
