// RTI DewPoint Driver
// Copyright 2011 Remote Technologies Inc.
//
// $Header: /XP8/Utility/DewPoint/DewPoint.js 10    12/30/15 10:25a Ericn $

// Formula:
//  Tdp=243.04*(LN(Hr/100)+((17.625*T)/(243.04+T)))/(17.625-LN(Hr/100)-((17.625*T)/(243.04+T)))
//
//  Tdp: Dewpoint temp in celsius
//  Hr: Relative humidity
//  T: Temperature celsius
//
// Fahrenheit, Celsius conversion
//  Tc=(Tf-32)*5/9
//  Tf=Tc*(9/5)+32
//
//  Tf: Temperature Fahrenheit
//  Tc: Temperature Celsius


//  Globals
var g_Zone = new Array();
var g_Debug = Boolean(Config.Get("DebugTrace") == "true");
var g_MaxZoness = 0;

System.Print("DewPoint: Initializing Driver\r\n");

function Print(str)
{
	System.Print("DewPoint: " + str);
}

function DebugPrint(str)
{
	if (g_Debug)
		Print(str);
}

function DewpointCelsius(Temp, Humidity)
{
	numerator = 243.04*(Math.log(Humidity/100.0)+((17.625*Temp)/(243.04+Temp)));
	denominator = (17.625-Math.log(Humidity/100.0)-((17.625*Temp)/(243.04+Temp)));
	
	return numerator / denominator;
}

function TempCelsius(TempF)
{
	return (TempF-32.0)*5.0/9.0;
}

function TempFahrenheit(TempC)
{
	return TempC*(9.0/5.0)+32.0;
}

// Define a dewpoint zone
function Zone(i)
{
	// Device enumeration
	this.Index = i;
	this.ZoneName = Config.Get("ZoneName" + i);
	
	// Zone parameters
	this.UnitsFahrenheit = Boolean(Config.Get("UnitsFahrenheit") == "true");
	this.TemperatureSysvar = parseInt(Config.Get("TemperatureSysvar" + i));	
	this.HumiditySysvar = parseInt(Config.Get("HumiditySysvar" + i));
	this.DehumidifyDelta = parseInt(Config.Get("DehumidifyDelta" + i));
	this.InletZoneName = Config.Get("InletZone" + i);
	this.OpenInletMacro = parseInt(Config.Get("OpenInletMacro" + i));
	this.CloseInletMacro = parseInt(Config.Get("CloseInletMacro" + i));
	
	// Zone calculations
	this.LastDewpoint = 0.0;
	this.CurrentDewpoint = 0.0;
	this.InletOpen = false;
}

function ZoneNameToIndex(name)
{
	// Find the index of the device
	i = 0;
	do {
		i++;
	} while ( (i < g_maxDevices) && (g_Zone[i].ZoneName != name) );
	
	if (i < g_maxDevices)
		return i;
	else
		return 0;
}

// Identify the number of zones
for (var i = 1; i <= 10; i++) {
	// get the strings from Config
	var ZoneName = Config.Get("ZoneName" + i);
	
	if (ZoneName != "") { // If there is a name, then we have a zone to calculate
		g_MaxZoness++;
		
		g_Zone[i] = new Zone(i);
		
		if (!SystemVars.AddSubscription(g_Zone[i].TemperatureSysvar))
			g_Zone[i].TemperatureSysvar = undefined;
		else
			DebugPrint("Add Temperature Subscription #" + g_Zone[i].TemperatureSysvar + ": " + g_Zone[i].ZoneName);
		
		if (!SystemVars.AddSubscription(g_Zone[i].HumiditySysvar))
			g_Zone[i].HumiditySysvar = undefined;
		else
			DebugPrint("Add Humidity Subscription #" + g_Zone[i].HumiditySysvar + ": " + g_Zone[i].ZoneName);
		
		DebugPrint("Adding Dewpoint Zone: " + g_Zone[i].ZoneName);
	}
}

// Handle all sysvar triggers
SystemVars.OnSysVarChangeFunc = SysvarChange;
function SysvarChange(varnum)
{
	var i = 0;
	var readvarnum;
	
	readvarnum = SystemVars.Read(varnum);
	
	// Find the index of the device
	i = 0;
	do {
		i++;
	} while ( (i < g_maxDevices) && (g_Zone[i].TemperatureSysvar != varnum) && (g_Zone[i].HumiditySysvar != varnum) );
		
	if (i < g_maxDevices)
	{
		// If we are in Fahrenheit mode convert to Celsius for dewpoint calculation
		if (g_Zone[i].UnitsFahrenheit)
		{
			Temp = TempCelsius(g_Zone[i].TemperatureSysvar);
		}
		else
		{
			Temp = g_Zone[i].TemperatureSysvar;
		}
		
		dp = DewpointCelsius(Temp, g_Zone[i].HumiditySysvar);
		
		// If we are in Fahrenheit mode convert dewpoint result to Fahrenheit
		if (g_Zone[i].UnitsFahrenheit)
		{
			Temp = TempFahrenheit(dp);
		}
		else
		{
			Temp = dp;
		}
		
		g_Zone[i].LastDewpoint = g_Zone[i].CurrentDewpoint;
		g_Zone[i].CurrentDewpoint = Temp;

		SystemVars.Write("DewPoint" + i, g_Zone[i].CurrentDewpoint);
		
		DebugPrint(g_Zone[i].)ZoneName + "Dew Point: " + g_Zone[i].CurrentDewpoint);
		
		// Do we have an inlet zone baffle?
		if (g_Zone[i].InletZoneName.length)
		{
			InletIndex = ZoneNameToIndex(g_Zone[i].InletZoneName);
			
			// Is the inlet DP rising or falling?
			if (g_Zone[InletIndex].CurrentDewpoint > g_Zone[InletIndex].LastDewpoint)
			{
				// Rising DP (inlet zone getting wetter)	
				
				if (g_Zone[i].InletOpen) // If inlet is open
				{
					if (!isNaN(g_Zone[i].CloseInletMacro))
					{
						DebugPrint("Running macro " + g_Zone[i].CloseInletMacro);
						System.RunSystemMacro(g_Zone[i].CloseInletMacro);
					}
					
					DebugPrint("Setting Event " + "CloseEventName" + i);
					System.SignalEvent("CloseEventName" + i);
				
					g_Zone[i].InletOpen = false;	
				}						
			}
			else
			{
				// Falling DP (inlet zone getting dryer)			
			
				if (!g_Zone[i].InletOpen) // If inlet is closed
				{
					// Is the dewpoint differance low enough in the inlet zone to open baffle?
					if (g_Zone[i].CurrentDewpoint > (g_Zone[i].DehumidifyDelta + g_Zone[InletIndex].CurrentDewpoint))
					{
						if (!isNaN(g_Zone[i].OpenInletMacro))
						{
							DebugPrint("Running macro " + g_Zone[i].OpenInletMacro);
							System.RunSystemMacro(g_Zone[i].OpenInletMacro);
						}
						
						DebugPrint("Setting Event " + "OpenEventName" + i);
						System.SignalEvent("OpenEventName" + i);
						
						g_Zone[i].InletOpen = true;
					}
				}
			}
		}
	}
}











