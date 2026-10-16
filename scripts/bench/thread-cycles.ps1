# Lector persistente de ciclos de CPU por hilo de workerd (QueryThreadCycleTime).
# Por cada línea leída en stdin escribe "pid:tid:ciclos,..." en stdout.
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class TC {
  [DllImport("kernel32.dll")] public static extern IntPtr OpenThread(int a, bool i, int id);
  [DllImport("kernel32.dll")] public static extern bool QueryThreadCycleTime(IntPtr h, out ulong c);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
"@
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($p in Get-Process workerd) { foreach ($t in $p.Threads) {
    $h = [TC]::OpenThread(0x0800, $false, $t.Id); $c = [uint64]0
    if ($h -ne [IntPtr]::Zero) { [void][TC]::QueryThreadCycleTime($h, [ref]$c); [void][TC]::CloseHandle($h) }
    $out.Add("$($p.Id):$($t.Id):$c") } }
  [Console]::Out.WriteLine(($out -join ","))
  [Console]::Out.Flush()
}
